import { createAdminClient } from "@/lib/supabase/admin";
import { fetchReddit } from "@/lib/sources/reddit";
import { fetchGdelt } from "@/lib/sources/gdelt";
import { fetchRss } from "@/lib/sources/rss";
import { fetchYouTube } from "@/lib/sources/youtube";
import { classifyBatch, type ClassifyInput } from "@/lib/ai/classify";
import { MODEL_CLASSIFIER } from "@/lib/ai/openai";
import type { RawEvent, EventSource } from "@/lib/sources/types";
import { CONSTITUENCIES, DISTRICTS } from "@/lib/seed/ap-data";

type IngestSummary = {
  source: EventSource | "rss+google_news";
  fetched: number;
  inserted: number;
  classified: number;
  errors: string[];
};

export async function runIngestAll(): Promise<IngestSummary[]> {
  const summaries: IngestSummary[] = [];
  const settled = await Promise.allSettled([
    fetchReddit(), fetchGdelt(), fetchRss(), fetchYouTube(),
  ]);

  const allEvents: RawEvent[] = [];
  for (const s of settled) {
    if (s.status === "fulfilled") allEvents.push(...s.value.events);
    else console.error("ingest fetch rejected:", s.reason);
  }

  // Group by source for summary, but persist + classify in one combined batch.
  const bySource = new Map<EventSource, RawEvent[]>();
  for (const e of allEvents) {
    if (!bySource.has(e.source)) bySource.set(e.source, []);
    bySource.get(e.source)!.push(e);
  }

  for (const [source, evs] of bySource) {
    const summary: IngestSummary = { source, fetched: evs.length, inserted: 0, classified: 0, errors: [] };
    try {
      const inserted = await persistAndClassify(evs);
      summary.inserted = inserted.inserted;
      summary.classified = inserted.classified;
    } catch (e) {
      summary.errors.push((e as Error).message);
    }
    summaries.push(summary);
  }
  return summaries;
}

// Hard cap on events classified per cycle. Keeps cron + Refresh bounded
// (and the OpenAI bill in check). Newest published_at first.
// Lowered from 40 → 20 to keep the cycle comfortably under the 60s
// Vercel-Hobby serverless timeout. Excess events still get inserted and
// are picked up by the next cron run.
const MAX_CLASSIFY_PER_CYCLE = 20;

export async function persistAndClassify(events: RawEvent[]): Promise<{ inserted: number; classified: number }> {
  if (events.length === 0) return { inserted: 0, classified: 0 };
  const sb = createAdminClient();

  // 1. Dedup-insert. Unique (source, source_id) → ignore conflicts.
  // Supabase pg-rest: use upsert with ignoreDuplicates and select only newly-inserted ids.
  // Trick: insert with `onConflict` set; then re-select what landed.
  const rows = events.map((e) => ({
    source: e.source,
    source_id: e.source_id,
    url: e.url,
    title: e.title,
    body: e.body,
    published_at: e.published_at,
    raw_payload: e.raw_payload,
  }));

  // Returns the inserted rows. Existing (conflicting) rows are NOT returned by upsert with ignoreDuplicates.
  const { data: insertedRows, error: insErr } = await sb
    .from("events")
    .upsert(rows, { onConflict: "source,source_id", ignoreDuplicates: true })
    .select("id, source, source_id, title, body, url");

  if (insErr) throw new Error(`event insert: ${insErr.message}`);
  const inserted = insertedRows ?? [];

  // 2. Classify only the newly-inserted events. Cap per cycle.
  if (inserted.length === 0) return { inserted: 0, classified: 0 };
  // The select() doesn't guarantee order — sort newest-by-source order then take top N.
  // We use the original `events` order (which fetchers return newest-first) by indexing.
  const orderBySid = new Map(events.map((e, i) => [`${e.source}:${e.source_id}`, i]));
  const sorted = [...inserted].sort(
    (a, b) => (orderBySid.get(`${a.source}:${a.source_id}`) ?? 1e9) - (orderBySid.get(`${b.source}:${b.source_id}`) ?? 1e9),
  );
  const toClassify = sorted.slice(0, MAX_CLASSIFY_PER_CYCLE);
  const classified = await classifyAndPersist(toClassify);
  return { inserted: inserted.length, classified };
}

type DbEvent = { id: string; source: EventSource; source_id: string; title: string; body: string | null; url: string | null };

export async function classifyAndPersist(events: DbEvent[]): Promise<number> {
  const sb = createAdminClient();
  const districtIdByName = await loadDistrictIds(sb);
  const constituencyIdByName = await loadConstituencyIds(sb);
  const mlaIdByName = await loadMlaIds(sb);

  const BATCH = 5;
  const PARALLEL = 4;
  let total = 0;

  // Build batch slices upfront, then process with PARALLEL workers.
  const slices: DbEvent[][] = [];
  for (let i = 0; i < events.length; i += BATCH) slices.push(events.slice(i, i + BATCH));

  let next = 0;
  async function processSlice(slice: DbEvent[]) {
    const inputs: ClassifyInput[] = slice.map((e) => ({
      source_id: e.source_id, source: e.source, title: e.title, body: e.body, url: e.url,
    }));
    let results;
    try {
      results = await classifyBatch(inputs);
    } catch (e) {
      // Log + skip this batch — don't poison the cron run
      await sb.from("audit_log").insert({
        action: "classifier_error",
        entity_type: "events",
        entity_id: slice.map((s) => s.source_id).join(","),
        metadata: { error: (e as Error).message, batch_size: slice.length },
      });
      return;
    }

    // Map back to event ids by source_id.
    const eventByKey = new Map(slice.map((e) => [e.source_id, e]));
    const classRows = results.flatMap((r) => {
      const ev = eventByKey.get(r.source_id);
      if (!ev) return [];
      return [{
        event_id: ev.id,
        language: r.language,
        entities: r.entities,
        sentiment: r.sentiment,
        sentiment_justification: r.sentiment_justification,
        district_id: r.district ? districtIdByName.get(r.district) ?? null : null,
        constituency_id: r.constituency ? constituencyIdByName.get(r.constituency) ?? null : null,
        mla_id: r.mla ? mlaIdByName.get(r.mla) ?? null : null,
        topic_tags: r.topic_tags,
        snt_velocity: r.snt_velocity,
        snt_credibility: r.snt_credibility,
        snt_vector: r.snt_vector,
        snt_score: r.snt_score,
        model_version: MODEL_CLASSIFIER,
      }];
    });

    if (classRows.length > 0) {
      const { error: cErr } = await sb.from("classifications").upsert(classRows, { onConflict: "event_id" });
      if (cErr) {
        await sb.from("audit_log").insert({
          action: "classification_insert_error",
          entity_type: "classifications",
          entity_id: classRows.map((c) => c.event_id).join(","),
          metadata: { error: cErr.message },
        });
      } else {
        total += classRows.length;
      }

      // Auto-create triage rows so /firm inbox can show them as 'new'.
      await sb.from("triage").upsert(
        classRows.map((c) => ({ event_id: c.event_id, status: "new" })),
        { onConflict: "event_id", ignoreDuplicates: true },
      );

      // Auto-create alerts for very high SNT scores.
      const eventById = new Map(events.map((e) => [e.id, e]));
      const alertRows = classRows
        .filter((c) => (c.snt_score ?? 0) >= 0.8)
        .map((c) => ({
          severity: ((c.snt_score ?? 0) >= 0.9 ? "s1" : "s2") as "s1" | "s2",
          title: trimAlertTitle(eventById.get(c.event_id)?.title ?? "High-SNT signal"),
          body: c.sentiment_justification,
          event_id: c.event_id,
        }));
      if (alertRows.length > 0) {
        await sb.from("alerts").insert(alertRows);
      }
    }
  }

  async function worker() {
    while (true) {
      const idx = next++;
      if (idx >= slices.length) return;
      await processSlice(slices[idx]);
    }
  }
  await Promise.all(Array.from({ length: PARALLEL }, () => worker()));
  return total;
}

function trimAlertTitle(s: string) { return s.length > 140 ? s.slice(0, 137) + "..." : s; }

async function loadDistrictIds(sb: ReturnType<typeof createAdminClient>): Promise<Map<string, number>> {
  const { data } = await sb.from("districts").select("id, name");
  const m = new Map<string, number>();
  for (const r of data ?? []) m.set(r.name, r.id);
  // Validate seed names are present (cheap sanity check)
  for (const d of DISTRICTS) if (!m.has(d.name)) console.warn(`district missing in DB: ${d.name}`);
  return m;
}
async function loadConstituencyIds(sb: ReturnType<typeof createAdminClient>): Promise<Map<string, number>> {
  const { data } = await sb.from("constituencies").select("id, name");
  const m = new Map<string, number>();
  for (const r of data ?? []) m.set(r.name, r.id);
  for (const c of CONSTITUENCIES) if (!m.has(c.name)) console.warn(`constituency missing: ${c.name}`);
  return m;
}
async function loadMlaIds(sb: ReturnType<typeof createAdminClient>): Promise<Map<string, number>> {
  const { data } = await sb.from("mlas").select("id, name");
  const m = new Map<string, number>();
  for (const r of data ?? []) m.set(r.name, r.id);
  return m;
}
