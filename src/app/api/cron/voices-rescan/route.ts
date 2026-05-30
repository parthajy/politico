import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractFromEvent, persistExtraction } from "@/lib/ai/voice-extract";
import { auditLog } from "@/lib/audit";
import { subDays } from "date-fns";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// GET /api/cron/voices-rescan
//
// Nightly catch-up — runs the voice extractor on events from the last 7 days
// that don't yet have any voice_event_links. Two paths produce orphans:
//
//   1. Events ingested via the regular cron (RSS / Reddit / YouTube / GDELT)
//      — those skip the extractor (it's expensive per-event); this cron
//      picks them up overnight.
//   2. Events where the inline extractor failed (Anthropic blip, schema
//      mismatch, etc.) on intern accept.
//
// Capped at MAX_PER_RUN events per call to keep within Vercel/CRON time +
// budget. Run daily; over a week it covers the catch-up window.

const MAX_PER_RUN = 30;
const WINDOW_DAYS = 7;

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const since = subDays(new Date(), WINDOW_DAYS).toISOString();

  // Get event_ids that already have at least one voice link
  const { data: linkedRows } = await admin
    .from("voice_event_links")
    .select("event_id")
    .limit(20_000);
  const linkedSet = new Set((linkedRows ?? []).map((r) => r.event_id));

  // Recent events that AREN'T in the linked set
  const { data: candidates } = await admin
    .from("events")
    .select("id, title, body, source, url, comments_text, raw_payload, published_at")
    .gte("ingested_at", since)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(MAX_PER_RUN * 4);

  const orphans = (candidates ?? []).filter((e) => !linkedSet.has(e.id)).slice(0, MAX_PER_RUN);

  if (orphans.length === 0) {
    return NextResponse.json({ ok: true, scanned: 0, processed: 0, note: "No events without voice links in the window." });
  }

  let processed = 0;
  let totalCreated = 0;
  let totalLinked = 0;
  let totalErrors = 0;

  for (const ev of orphans) {
    try {
      const result = await extractFromEvent({
        id: ev.id,
        title: ev.title,
        body: ev.body,
        source: ev.source,
        url: ev.url,
        comments_text: (ev as { comments_text?: string | null }).comments_text ?? null,
        raw_payload: ev.raw_payload as Record<string, unknown> | null,
      });
      const persisted = await persistExtraction(ev.id, result);
      processed += 1;
      totalCreated += persisted.created;
      totalLinked += persisted.linked;
    } catch (e) {
      totalErrors += 1;
      console.warn(`voices-rescan ${ev.id}: ${(e as Error).message}`);
    }
  }

  await auditLog({
    user_id: null,
    action: "voices_rescan_cron",
    entity_type: "events",
    entity_id: "batch",
    metadata: {
      window_days: WINDOW_DAYS,
      candidates: candidates?.length ?? 0,
      orphans: orphans.length,
      processed,
      voices_created: totalCreated,
      voices_linked: totalLinked,
      errors: totalErrors,
    },
  });

  return NextResponse.json({
    ok: true,
    orphans_found: orphans.length,
    processed,
    voices_created: totalCreated,
    voices_linked: totalLinked,
    errors: totalErrors,
  });
}
