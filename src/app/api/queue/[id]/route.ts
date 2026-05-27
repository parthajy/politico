import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { classifyAndPersist } from "@/lib/ingest";
import { auditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

const Accept = z.object({
  action: z.literal("accept"),
  title: z.string().min(2),
  body: z.string().min(2),
  url: z.string().url().optional().nullable(),
  district_id: z.number().int().nullable().optional(),
  intern_notes: z.string().optional().nullable(),
});
const Reject = z.object({
  action: z.literal("reject"),
  reason: z.string().min(2),
});
const Body = z.discriminatedUnion("action", [Accept, Reject]);

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  const { data: me } = await sb.from("users").select("role").eq("id", user.id).single();
  // Triage allowed by interns + analysts + admins (anyone firm-side)
  if (me?.role !== "firm_admin" && me?.role !== "firm_analyst" && me?.role !== "firm_intern") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  let body: z.infer<typeof Body>;
  try { body = Body.parse(await req.json()); } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: sub, error: sErr } = await admin
    .from("field_submissions")
    .select("id, submitter_id, url, ai_classification, status")
    .eq("id", params.id)
    .maybeSingle();
  if (sErr || !sub) return NextResponse.json({ ok: false, error: sErr?.message ?? "submission not found" }, { status: 404 });
  if (sub.status === "accepted" || sub.status === "rejected") {
    return NextResponse.json({ ok: false, error: "submission already processed" }, { status: 400 });
  }

  if (body.action === "reject") {
    await admin.from("field_submissions").update({
      status: "rejected",
      reviewer_id: user.id,
      rejection_reason: body.reason,
      reviewed_at: new Date().toISOString(),
    }).eq("id", params.id);
    await auditLog({ user_id: user.id, action: "queue_reject", entity_type: "field_submissions", entity_id: params.id, metadata: { reason: body.reason } });
    return NextResponse.json({ ok: true });
  }

  // accept: promote to events + classify
  const source_id = body.url ? `url:${hash(body.url)}` : `queue:${params.id}`;
  const { data: ev, error: insErr } = await admin.from("events").upsert({
    source: "manual",
    source_id,
    url: body.url ?? null,
    title: body.title,
    body: body.body,
    published_at: new Date().toISOString(),
    raw_payload: {
      via: "queue",
      submission_id: params.id,
      submitter_id: sub.submitter_id,
      intern_notes: body.intern_notes ?? null,
      district_id: body.district_id ?? null,
      ai_first_pass: sub.ai_classification ?? null,
    },
  }, { onConflict: "source,source_id" })
    .select("id, source, source_id, title, body, url")
    .single();
  if (insErr || !ev) return NextResponse.json({ ok: false, error: `event insert: ${insErr?.message}` }, { status: 500 });

  let classified = 0;
  try {
    classified = await classifyAndPersist([{
      id: ev.id, source: ev.source, source_id: ev.source_id,
      title: ev.title ?? "", body: ev.body ?? null, url: ev.url ?? null,
    }]);
  } catch (e) {
    console.warn("queue classify error:", (e as Error).message);
  }

  await admin.from("field_submissions").update({
    status: "accepted",
    reviewer_id: user.id,
    reviewed_at: new Date().toISOString(),
    accepted_event_id: ev.id,
    intern_notes: body.intern_notes ?? null,
  }).eq("id", params.id);

  await auditLog({
    user_id: user.id,
    action: "queue_accept",
    entity_type: "field_submissions",
    entity_id: params.id,
    metadata: { event_id: ev.id, classified, edited_title: body.title, edited_body_len: body.body.length },
  });

  return NextResponse.json({ ok: true, event_id: ev.id });
}
