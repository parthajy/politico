// Sentiment snapshots backfill — generates one snapshot per scope per day
// for the last 30 days, computed from the classified events we have.
// Where a (scope, day) has zero classified events, we synthesise a small
// random walk anchored to the cross-scope baseline so trend lines have shape.
//
// Run with: npx tsx scripts/seed-sentiment-snapshots.ts

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const DAYS_BACK = 30;

type ScopeRef = { scope_type: "state" | "district" | "constituency" | "minister"; scope_id: number | null };

function ymd(d: Date) { return d.toISOString().slice(0, 10); }

async function main() {
  // Wipe old snapshots so re-run is clean.
  const { error: delErr } = await sb.from("sentiment_snapshots").delete().gte("date", "1900-01-01");
  if (delErr) throw delErr;
  console.log("wiped existing sentiment_snapshots");

  // Build scopes: state, every district, every Tier-1 constituency, top 5 ministers.
  const { data: districts } = await sb.from("districts").select("id, tier");
  const { data: constituencies } = await sb.from("constituencies").select("id, district_id");
  const { data: ministers } = await sb.from("mlas").select("id, is_minister, is_cm, is_deputy_cm").eq("is_minister", true);
  if (!districts || !constituencies || !ministers) throw new Error("ref data missing");

  const tier1Districts = new Set(districts.filter((d) => d.tier === 1).map((d) => d.id));
  const tier1Constituencies = constituencies.filter((c) => c.district_id != null && tier1Districts.has(c.district_id));
  const topMinisters = ministers
    .sort((a, b) => Number(b.is_cm) * 10 + Number(b.is_deputy_cm) - (Number(a.is_cm) * 10 + Number(a.is_deputy_cm)))
    .slice(0, 5);

  const scopes: ScopeRef[] = [
    { scope_type: "state", scope_id: null },
    ...districts.map((d) => ({ scope_type: "district" as const, scope_id: d.id })),
    ...tier1Constituencies.map((c) => ({ scope_type: "constituency" as const, scope_id: c.id })),
    ...topMinisters.map((m) => ({ scope_type: "minister" as const, scope_id: m.id })),
  ];
  console.log(`scopes: ${scopes.length} (state=1, districts=${districts.length}, constituencies=${tier1Constituencies.length}, ministers=${topMinisters.length})`);

  // Pull classifications joined with events to compute real per-day sentiment.
  // For tractability we pull only the last 60 days of classifications.
  const since = new Date(Date.now() - 60 * 86400_000).toISOString();
  const { data: rows } = await sb
    .from("classifications")
    .select("sentiment, district_id, constituency_id, mla_id, classified_at, events!inner(published_at)")
    .gte("classified_at", since);

  type RowShape = { sentiment: number; district_id: number | null; constituency_id: number | null; mla_id: number | null; classified_at: string; events: { published_at: string | null } | null };
  const data = (rows ?? []) as unknown as RowShape[];

  // Bucket by (scope-key, day).
  const bucket = new Map<string, { sum: number; n: number }>();
  for (const r of data) {
    const day = (r.events?.published_at ?? r.classified_at).slice(0, 10);
    const keys: string[] = ["state:_:" + day];
    if (r.district_id) keys.push(`district:${r.district_id}:${day}`);
    if (r.constituency_id) keys.push(`constituency:${r.constituency_id}:${day}`);
    if (r.mla_id) keys.push(`minister:${r.mla_id}:${day}`);
    for (const k of keys) {
      const b = bucket.get(k) ?? { sum: 0, n: 0 };
      b.sum += r.sentiment ?? 0;
      b.n += 1;
      bucket.set(k, b);
    }
  }

  // For each (scope, day in 30-day window), compute or synthesise a snapshot.
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const rowsToInsert: { date: string; scope_type: string; scope_id: number | null; net_sentiment: number; sample_size: number }[] = [];

  for (const scope of scopes) {
    // Anchor each scope to a baseline drawn from a small range (-0.3..0.2)
    const baseline = (Math.random() - 0.6) * 0.5;
    let last = baseline;
    for (let i = DAYS_BACK - 1; i >= 0; i--) {
      const d = new Date(today.getTime() - i * 86400_000);
      const day = ymd(d);
      const key = `${scope.scope_type}:${scope.scope_id ?? "_"}:${day}`;
      const b = bucket.get(key);
      let net: number, sample: number;
      if (b && b.n > 0) {
        net = b.sum / b.n;
        sample = b.n;
      } else {
        // Random walk anchored at baseline. Keeps trend lines moving.
        const drift = (Math.random() - 0.5) * 0.1;
        last = Math.max(-1, Math.min(1, last * 0.7 + baseline * 0.3 + drift));
        net = last;
        sample = 0; // synthesised
      }
      rowsToInsert.push({
        date: day,
        scope_type: scope.scope_type,
        scope_id: scope.scope_id,
        net_sentiment: Math.round(net * 100) / 100,
        sample_size: sample,
      });
    }
  }

  console.log(`inserting ${rowsToInsert.length} snapshot rows`);
  // Chunk inserts to stay below pg-rest payload limit
  const CHUNK = 500;
  for (let i = 0; i < rowsToInsert.length; i += CHUNK) {
    const slice = rowsToInsert.slice(i, i + CHUNK);
    const { error } = await sb.from("sentiment_snapshots").insert(slice);
    if (error) throw error;
  }
  console.log("done");
}

main().catch((e) => { console.error(e); process.exit(1); });
