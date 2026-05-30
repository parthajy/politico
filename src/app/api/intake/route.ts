import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { auditLog } from "@/lib/audit";
import { extractUrl } from "@/lib/intake/extract";
import { ocrImage } from "@/lib/intake/ocr";
import { classifyAndPersist } from "@/lib/ingest";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

// Phase-0 intake: any firm member pastes a URL (+ optional note, district,
// volunteer attribution, screenshot). The endpoint fetches the page, OCRs
// the screenshot if attached, creates an event with source='manual', runs
// the classifier, and returns the resulting SNT score for inline display.

const Body = z.object({
  url: z.string().url().optional().or(z.literal("")),
  note: z.string().max(500).optional(),
  district_id: z.number().int().optional().nullable(),
  volunteer_name: z.string().max(120).optional(),
  image_data_url: z.string().optional(), // data:image/...;base64,...
  // New: additional screenshots (comment threads, audience reactions, reposts).
  // Each is a data: URL. Capped at 4 to keep payloads reasonable.
  extra_images: z.array(z.string()).max(4).optional(),
  // New: free-form note about comments / reactions the volunteer observed.
  // Goes into the intelligence-extraction pipeline alongside the main body.
  comments_text: z.string().max(4000).optional(),
}).refine((b) => !!b.url || !!b.image_data_url, {
  message: "Provide a URL or an image (or both)",
});

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

export async function POST(req: Request) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  const { data: profile } = await sb.from("users").select("role").eq("id", user.id).single();
  const role = profile?.role;
  if (role !== "firm_admin" && role !== "firm_analyst" && role !== "firm_intern" && role !== "volunteer") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  // Volunteers' submissions go to the triage queue; firm staff (admin/analyst/intern)
  // submissions become events directly (interns paste via /firm/intake for manual entries).
  const routeToQueue = role === "volunteer";

  let body: z.infer<typeof Body>;
  try { body = Body.parse(await req.json()); } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }

  const t0 = Date.now();
  let extracted: Awaited<ReturnType<typeof extractUrl>> | null = null;
  let ocr: Awaited<ReturnType<typeof ocrImage>> | null = null;

  // Fetch URL metadata if URL provided
  if (body.url) {
    try { extracted = await extractUrl(body.url); }
    catch (e) {
      // Don't hard-fail — capture the URL with empty metadata so the analyst can still submit
      extracted = {
        url: body.url, title: "(fetch failed — open URL to review)",
        description: (e as Error).message, image_url: null, site_name: null,
        author: null, published_at: null, text_excerpt: null,
        platform: null, needs_screenshot: false, extract_quality: "empty",
      };
    }
  }

  // OCR image if provided
  if (body.image_data_url) {
    try { ocr = await ocrImage(body.image_data_url); }
    catch (e) {
      return NextResponse.json({ ok: false, error: `OCR failed: ${(e as Error).message}` }, { status: 500 });
    }
  }

  // Compose the event
  const title = extracted?.title || ocr?.caption || body.note?.slice(0, 120) || "(manual intake)";
  const bodyText = [
    body.note ? `Analyst note: ${body.note}` : null,
    extracted?.description ? `Page description: ${extracted.description}` : null,
    extracted?.text_excerpt ? `Page excerpt: ${extracted.text_excerpt.slice(0, 1200)}` : null,
    ocr?.transcript ? `Screenshot OCR: ${ocr.transcript}` : null,
    ocr?.caption && !extracted ? `Screenshot caption: ${ocr.caption}` : null,
    body.volunteer_name ? `Submitted via field volunteer: ${body.volunteer_name}` : null,
  ].filter(Boolean).join("\n\n");

  const url = body.url || null;
  const source_id = url ? `url:${hash(url)}` : `intake:${user.id}:${Date.now()}`;
  const admin = createAdminClient();

  // Volunteer flow: write to field_submissions queue, no event yet.
  // We DON'T OCR the extra images here — too slow on submit. The intern can
  // view them in /firm/queue, OCR-on-demand or accept them as-is to flow
  // into the voice extractor downstream.
  if (routeToQueue) {
    // For now, store extra images as data: URLs directly in the column.
    // For high-volume production we'd upload to storage and store URLs.
    const extraUrls = body.extra_images ?? [];
    const { data: sub, error: qErr } = await admin.from("field_submissions").insert({
      submitter_id: user.id,
      url,
      note: body.note ?? null,
      suggested_district_id: body.district_id ?? null,
      platform: extracted?.platform ?? null,
      extract_quality: extracted?.extract_quality ?? null,
      ocr_transcript: ocr?.transcript ?? null,
      ocr_caption: ocr?.caption ?? null,
      ai_title: title,
      ai_body: bodyText,
      ai_classification: null,  // filled in if/when AI processes
      extra_screenshot_urls: extraUrls,
      comments_text: body.comments_text ?? null,
      status: (extracted?.needs_screenshot && !ocr) || extracted?.extract_quality === "empty" ? "needs_human" : "pending",
    }).select("id").single();
    if (qErr || !sub) {
      return NextResponse.json({ ok: false, error: `queue insert: ${qErr?.message}` }, { status: 500 });
    }
    await auditLog({
      user_id: user.id,
      action: "field_submission",
      entity_type: "field_submissions",
      entity_id: sub.id,
      metadata: {
        had_url: !!body.url, had_image: !!body.image_data_url,
        platform: extracted?.platform ?? null, extract_quality: extracted?.extract_quality ?? null,
      },
    });
    return NextResponse.json({
      ok: true, ms: Date.now() - t0,
      submission_id: sub.id,
      queued: true,
      title,
      platform: extracted?.platform ?? null,
      extract_quality: extracted?.extract_quality ?? null,
      message: "Submitted to the triage queue — an intern will review shortly.",
    });
  }

  // Staff flow: direct event insertion + classification
  const { data: ev, error: insErr } = await admin.from("events").upsert({
    source: "manual",
    source_id,
    url,
    title,
    body: bodyText,
    published_at: extracted?.published_at ? safeDate(extracted.published_at) : new Date().toISOString(),
    raw_payload: {
      submitted_by: user.id,
      volunteer_name: body.volunteer_name ?? null,
      district_id: body.district_id ?? null,
      via: "intake",
      og: extracted ? {
        site_name: extracted.site_name,
        author: extracted.author,
        image_url: extracted.image_url,
      } : null,
      has_screenshot: !!ocr,
      ocr_caption: ocr?.caption ?? null,
    },
  }, { onConflict: "source,source_id" })
    .select("id, source, source_id, title, body, url")
    .single();
  if (insErr || !ev) {
    return NextResponse.json({ ok: false, error: `event insert: ${insErr?.message}` }, { status: 500 });
  }

  // Classify synchronously so we can show the SNT score on submission
  let classified = 0;
  try {
    classified = await classifyAndPersist([{
      id: ev.id, source: ev.source, source_id: ev.source_id,
      title: ev.title ?? "", body: ev.body ?? null, url: ev.url ?? null,
    }]);
  } catch (e) {
    console.warn("intake classify error:", (e as Error).message);
  }

  // Read back the classification for the response
  const { data: cls } = await sb
    .from("classifications")
    .select("snt_score, sentiment, district_id, constituency_id, topic_tags, sentiment_justification, districts(name), constituencies(name)")
    .eq("event_id", ev.id)
    .maybeSingle();

  await auditLog({
    user_id: user.id,
    action: "intake_submit",
    entity_type: "events",
    entity_id: ev.id,
    metadata: {
      ms: Date.now() - t0,
      had_url: !!body.url,
      had_image: !!body.image_data_url,
      volunteer_name: body.volunteer_name ?? null,
      classified,
      snt_score: cls?.snt_score ?? null,
    },
  });

  // Build a UX warning when content recovery was thin/empty and the user can fix it
  let warning: string | null = null;
  if (extracted?.needs_screenshot && !ocr) {
    warning = `${extracted.platform} blocks bot fetchers — we couldn't read the post content from the URL. Re-submit with a screenshot attached so we can OCR the text.`;
  } else if (extracted?.extract_quality === "empty" && !ocr) {
    warning = "This URL returned very little content (likely behind a paywall or login). Attach a screenshot for the actual text.";
  } else if (extracted?.extract_quality === "thin" && !ocr) {
    warning = "We pulled some metadata but not the full post text. Attach a screenshot if the classification looks off.";
  }

  return NextResponse.json({
    ok: true,
    ms: Date.now() - t0,
    event_id: ev.id,
    title,
    snt_score: cls?.snt_score ?? null,
    sentiment: cls?.sentiment ?? null,
    district: ((cls?.districts as unknown) as { name: string } | null)?.name ?? null,
    constituency: ((cls?.constituencies as unknown) as { name: string } | null)?.name ?? null,
    topic_tags: cls?.topic_tags ?? [],
    sentiment_justification: cls?.sentiment_justification ?? null,
    ocr_caption: ocr?.caption ?? null,
    platform: extracted?.platform ?? null,
    extract_quality: extracted?.extract_quality ?? null,
    warning,
  });
}

function safeDate(s: string): string {
  const d = new Date(s);
  return isNaN(d.valueOf()) ? new Date().toISOString() : d.toISOString();
}
