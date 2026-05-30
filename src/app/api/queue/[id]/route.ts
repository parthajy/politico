import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { classifyAndPersist } from "@/lib/ingest";
import { auditLog } from "@/lib/audit";
import { extractFromEvent, persistExtraction } from "@/lib/ai/voice-extract";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

const Accept = z.object({
  action: z.literal("accept"),
  title: z.string().min(2),
  body: z.string().min(2),
  url: z.string().url().optional().nullable(),
  district_id: z.number().int().nullable().optional(),
  intern_notes: z.string().optional().nullable(),
  // Optional intelligence payload — passed through from the volunteer
  // submission OR added by the intern at triage time.
  comments_text: z.string().optional().nullable(),
  extra_screenshot_urls: z.array(z.string().url()).optional(),
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
    // Carry through volunteer-supplied + intern-added intelligence so the
    // voice extractor can see it. The dedicated columns are populated
    // alongside raw_payload for easier querying.
    comments_text: body.comments_text ?? null,
    extra_screenshot_urls: body.extra_screenshot_urls ?? [],
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

  // CRITICAL: write a stub classification row + triage row IMMEDIATELY so the
  // event appears in the inbox even if the AI classifier fails downstream.
  // The AI call below upserts (onConflict: event_id) so a successful run
  // replaces the stub with real numbers; a failed run leaves the stub and the
  // event is still visible (and the "Re-classify" button on the event detail
  // sheet can retry it). Before this fix, classifier failures silently
  // dropped intern-accepted news on the floor.
  await admin.from("classifications").upsert({
    event_id: ev.id,
    language: "en",
    entities: [],
    sentiment: 0,
    sentiment_justification: "Intern-accepted — AI classification pending. Click 'Re-classify' to enrich.",
    district_id: body.district_id ?? null,
    constituency_id: null,
    mla_id: null,
    topic_tags: [],
    snt_velocity: 0.5,
    snt_credibility: 0.7, // intern-vetted ≈ credible by default
    snt_vector: 0.4,
    snt_score: 0.5,        // mid-priority placeholder so it sorts mid-pack
    model_version: "manual_stub",
  }, { onConflict: "event_id", ignoreDuplicates: true });
  await admin.from("triage").upsert(
    { event_id: ev.id, status: "new" as const },
    { onConflict: "event_id", ignoreDuplicates: true },
  );

  let classified = 0;
  let classifyError: string | null = null;
  try {
    classified = await classifyAndPersist([{
      id: ev.id, source: ev.source, source_id: ev.source_id,
      title: ev.title ?? "", body: ev.body ?? null, url: ev.url ?? null,
    }]);
  } catch (e) {
    classifyError = (e as Error).message;
    console.warn("queue classify error:", classifyError);
  }

  // Voice + engagement extraction (second AI pass — independent of classifier
  // so failure here doesn't poison the event). Best-effort; logs but doesn't
  // surface error to the intern.
  let voicesCreated = 0;
  let voicesLinked = 0;
  try {
    const ext = await extractFromEvent({
      id: ev.id,
      title: ev.title,
      body: ev.body,
      source: ev.source,
      url: ev.url,
      comments_text: body.comments_text ?? null,
      raw_payload: null, // freshly inserted; nothing extra to read
    });
    const persisted = await persistExtraction(ev.id, ext);
    voicesCreated = persisted.created;
    voicesLinked = persisted.linked;
  } catch (e) {
    console.warn("queue voice-extract error:", (e as Error).message);
    await auditLog({
      user_id: user.id,
      action: "voice_extract_error",
      entity_type: "events",
      entity_id: ev.id,
      metadata: { error: (e as Error).message },
    });
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
    metadata: {
      event_id: ev.id, classified,
      voices_created: voicesCreated, voices_linked: voicesLinked,
      edited_title: body.title, edited_body_len: body.body.length,
    },
  });

  return NextResponse.json({
    ok: true,
    event_id: ev.id,
    classified: classified > 0,
    classify_error: classifyError,
    voices_created: voicesCreated,
    voices_linked: voicesLinked,
    note: classified > 0
      ? `Accepted, classified, ${voicesCreated} new voice${voicesCreated === 1 ? "" : "s"} extracted.`
      : "Accepted with stub classification — use 'Re-classify' on the event detail to enrich.",
  });
}
