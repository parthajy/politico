import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { auditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// GET /api/cron/auto-archive
//
// Daily cleanup: any classification older than 90 days that no human ever
// triaged (status still 'new') gets marked 'closed' — the inbox's default
// 30-day filter already hides it, this just prevents the all-time view from
// being a wasteland of forgotten low-priority signals.
//
// CRON_SECRET protected. Wire in cron-job.org once a day at 03:00 IST.

const ARCHIVE_AFTER_DAYS = 90;

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - ARCHIVE_AFTER_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const admin = createAdminClient();

  // Find untouched-old event_ids via the classifications table (it has classified_at).
  const { data: stale } = await admin
    .from("classifications")
    .select("event_id")
    .lt("classified_at", cutoff)
    .limit(500);
  if (!stale || stale.length === 0) {
    return NextResponse.json({ ok: true, scanned: 0, archived: 0, note: "Nothing old enough to archive." });
  }
  const staleIds = stale.map((s) => s.event_id);

  // Of those, find the ones whose triage row is still 'new' (never touched)
  const { data: untouched } = await admin
    .from("triage")
    .select("event_id, status")
    .in("event_id", staleIds)
    .eq("status", "new");
  const toArchive = (untouched ?? []).map((t) => t.event_id);

  if (toArchive.length === 0) {
    return NextResponse.json({ ok: true, scanned: staleIds.length, archived: 0 });
  }

  const { error } = await admin
    .from("triage")
    .update({ status: "closed" })
    .in("event_id", toArchive);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  await auditLog({
    user_id: null,
    action: "inbox_auto_archive",
    entity_type: "triage",
    entity_id: "batch",
    metadata: {
      scanned: staleIds.length,
      archived: toArchive.length,
      cutoff_days: ARCHIVE_AFTER_DAYS,
    },
  });

  return NextResponse.json({ ok: true, scanned: staleIds.length, archived: toArchive.length });
}
