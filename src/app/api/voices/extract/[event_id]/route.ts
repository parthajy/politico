import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractFromEvent, persistExtraction } from "@/lib/ai/voice-extract";
import { auditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// POST /api/voices/extract/[event_id]
//
// Manual trigger of the voice + engagement extractor on a specific event.
// Surfaced from the event detail sheet for analyst-driven re-extraction
// after editing body/title or pasting additional comments.

export async function POST(_req: Request, { params }: { params: { event_id: string } }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  const { data: me } = await sb.from("users").select("role").eq("id", user.id).single();
  if (!me || !["firm_admin", "firm_analyst", "firm_intern", "superadmin"].includes(me.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: ev, error } = await admin
    .from("events")
    .select("id, title, body, source, url, comments_text, raw_payload")
    .eq("id", params.event_id)
    .maybeSingle();
  if (error || !ev) return NextResponse.json({ ok: false, error: error?.message ?? "event not found" }, { status: 404 });

  try {
    const result = await extractFromEvent({
      id: ev.id,
      title: ev.title,
      body: ev.body,
      source: ev.source,
      url: ev.url,
      comments_text: ev.comments_text,
      raw_payload: ev.raw_payload as Record<string, unknown> | null,
    });
    const persisted = await persistExtraction(ev.id, result);
    await auditLog({
      user_id: user.id,
      action: "voice_extract_manual",
      entity_type: "events",
      entity_id: ev.id,
      metadata: { voices_returned: result.voices.length, ...persisted },
    });
    return NextResponse.json({ ok: true, ...persisted, voices_returned: result.voices.length });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
