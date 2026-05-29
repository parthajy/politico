import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { classifyAndPersist } from "@/lib/ingest";
import { auditLog } from "@/lib/audit";
import type { EventSource } from "@/lib/sources/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// POST /api/events/[id]/reclassify
//
// Re-runs the AI classifier on a single event and upserts the result into
// `classifications` (replacing any existing row, including stubs from the
// queue-accept path). Firm-side only (admin/analyst/intern).
//
// Used by the "Re-classify" button on the event detail sheet and by the
// /api/events/reclassify-orphans backfill route.

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  const { data: me } = await sb.from("users").select("role").eq("id", user.id).single();
  if (!me || !["firm_admin", "firm_analyst", "firm_intern", "superadmin"].includes(me.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: ev, error: evErr } = await admin
    .from("events")
    .select("id, source, source_id, title, body, url")
    .eq("id", params.id)
    .maybeSingle();
  if (evErr || !ev) return NextResponse.json({ ok: false, error: evErr?.message ?? "event not found" }, { status: 404 });

  let classified = 0;
  let classifyError: string | null = null;
  try {
    classified = await classifyAndPersist([{
      id: ev.id, source: ev.source as EventSource, source_id: ev.source_id,
      title: ev.title ?? "", body: ev.body ?? null, url: ev.url ?? null,
    }]);
  } catch (e) {
    classifyError = (e as Error).message;
  }

  await auditLog({
    user_id: user.id,
    action: "event_reclassify",
    entity_type: "events",
    entity_id: ev.id,
    metadata: { classified, error: classifyError },
  });

  if (classified === 0 && classifyError) {
    return NextResponse.json({ ok: false, error: classifyError }, { status: 500 });
  }
  if (classified === 0) {
    return NextResponse.json({ ok: false, error: "classifier returned no rows (check audit_log for details)" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, classified });
}
