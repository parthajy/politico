import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { classifyAndPersist } from "@/lib/ingest";
import { auditLog } from "@/lib/audit";
import { requireFirmOrCron } from "@/lib/auth-cron";
import type { EventSource } from "@/lib/sources/types";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// POST /api/events/reclassify-orphans
//
// One-click backfill: finds events that EITHER have no classification row OR
// have only a stub classification (model_version = 'manual_stub') and re-runs
// the AI classifier on all of them. Firm-side only.
//
// This is the recovery path for the bug where intern-accepted news items were
// invisible in the inbox because the inline AI call failed silently and the
// inbox inner-joins classifications. After the queue-accept route was patched
// to always write a stub, this endpoint cleans up the rows that were already
// orphaned in the DB before the patch.

const MAX_PER_RUN = 50;

export async function POST(req: Request) {
  // Dual auth: firm/superadmin session OR CRON_SECRET (for the periodic
  // self-heal cron that recovers events whose inline classifier call failed).
  const auth = await requireFirmOrCron(req, ["firm_admin", "firm_analyst", "superadmin"]);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const admin = createAdminClient();

  // 1) Events with NO classification row at all
  const { data: classifiedIds } = await admin.from("classifications").select("event_id").limit(50000);
  const classifiedSet = new Set((classifiedIds ?? []).map((r) => r.event_id));

  const { data: allEvents } = await admin
    .from("events")
    .select("id, source, source_id, title, body, url, ingested_at")
    .order("ingested_at", { ascending: false })
    .limit(2000);

  const orphans = (allEvents ?? []).filter((e) => !classifiedSet.has(e.id));

  // 2) Events whose classification is just a stub (manual_stub)
  const { data: stubs } = await admin
    .from("classifications")
    .select("event_id, events!inner(id, source, source_id, title, body, url)")
    .eq("model_version", "manual_stub")
    .limit(200);
  const stubEvents = (stubs ?? []).map((r) => {
    const ev = (r.events as unknown) as { id: string; source: string; source_id: string; title: string; body: string | null; url: string | null };
    return ev;
  });

  // Merge + dedupe (orphans win, then stubs) — strip ingested_at since we
  // only feed classifyAndPersist the shape it needs.
  type ToClassify = { id: string; source: EventSource; source_id: string; title: string; body: string | null; url: string | null };
  const toClassify: ToClassify[] = orphans.map((e) => ({
    id: e.id, source: e.source as EventSource, source_id: e.source_id, title: e.title, body: e.body, url: e.url,
  }));
  const seen = new Set(toClassify.map((e) => e.id));
  for (const s of stubEvents) if (!seen.has(s.id)) {
    toClassify.push({
      id: s.id, source: s.source as EventSource, source_id: s.source_id,
      title: s.title, body: s.body, url: s.url,
    });
    seen.add(s.id);
  }

  const slice = toClassify.slice(0, MAX_PER_RUN);

  if (slice.length === 0) {
    return NextResponse.json({
      ok: true,
      orphans: 0,
      stubs: 0,
      classified: 0,
      note: "No orphaned or stub-classified events to recover.",
    });
  }

  let classified = 0;
  let classifyError: string | null = null;
  try {
    classified = await classifyAndPersist(slice.map((e) => ({
      id: e.id, source: e.source, source_id: e.source_id,
      title: e.title ?? "", body: e.body ?? null, url: e.url ?? null,
    })));
  } catch (e) {
    classifyError = (e as Error).message;
  }

  await auditLog({
    user_id: auth.user_id,
    action: auth.via === "cron" ? "events_reclassify_orphans_cron" : "events_reclassify_orphans",
    entity_type: "events",
    entity_id: "batch",
    metadata: {
      orphans_found: orphans.length,
      stubs_found: stubEvents.length,
      attempted: slice.length,
      classified,
      error: classifyError,
      capped_at: MAX_PER_RUN,
    },
  });

  return NextResponse.json({
    ok: true,
    orphans_found: orphans.length,
    stubs_found: stubEvents.length,
    attempted: slice.length,
    classified,
    error: classifyError,
    note: classified < slice.length
      ? `${classified}/${slice.length} classified. ${slice.length - classified} still need attention — check audit log for AI errors.`
      : `All ${classified} classified successfully.`,
  });
}
