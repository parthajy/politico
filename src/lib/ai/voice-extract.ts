import { z } from "zod";
import { jsonCall, MODEL_BRIEF } from "./anthropic";
import { createAdminClient } from "@/lib/supabase/admin";

// ─────────────────────────────────────────────────────────────────────────────
// Voice + engagement extraction from a single event.
//
// Pulled out of the classifier on purpose — classifier focuses on the SIGNAL
// (topic / sentiment / SNT). This call focuses on the PEOPLE in the signal
// (poster, quoted figures, named commenters) and the audience-side metadata
// (likes, retweets, comments visible in screenshots, etc.).
//
// Runs after the classifier on intern accept, and can be re-triggered manually
// from the event detail sheet.
// ─────────────────────────────────────────────────────────────────────────────

export type ExtractedVoice = {
  name: string;
  handle: string | null;
  platform: string | null;
  profession_category: "journalist" | "activist" | "official" | "influencer" | "community_leader" | "politician" | "expert" | "troll" | "commenter" | "unknown";
  role_guess: string | null;
  outlet: string | null;
  reach_signal: string | null;
  why_they_matter: string | null;
  role_in_event: "author" | "quoted" | "mentioned" | "commenter";
  sentiment: number | null;
  confidence: number;
};

export type Engagement = {
  likes: number | null;
  retweets: number | null;
  shares: number | null;
  comments: number | null;
  views: number | null;
  notes: string | null;
};

export type ExtractionResult = {
  voices: ExtractedVoice[];
  engagement: Engagement;
};

const VoiceSchema = {
  type: "object",
  properties: {
    name: { type: "string" },
    handle: { type: ["string", "null"] },
    platform: { type: ["string", "null"] },
    profession_category: {
      type: "string",
      enum: ["journalist", "activist", "official", "influencer", "community_leader", "politician", "expert", "troll", "commenter", "unknown"],
    },
    role_guess: { type: ["string", "null"] },
    outlet: { type: ["string", "null"] },
    reach_signal: { type: ["string", "null"] },
    why_they_matter: { type: ["string", "null"] },
    role_in_event: { type: "string", enum: ["author", "quoted", "mentioned", "commenter"] },
    sentiment: { type: ["number", "null"] },
    confidence: { type: "number" },
  },
  required: ["name", "handle", "platform", "profession_category", "role_guess", "outlet", "reach_signal", "why_they_matter", "role_in_event", "sentiment", "confidence"],
};

const EngagementSchema = {
  type: "object",
  properties: {
    likes: { type: ["integer", "null"] },
    retweets: { type: ["integer", "null"] },
    shares: { type: ["integer", "null"] },
    comments: { type: ["integer", "null"] },
    views: { type: ["integer", "null"] },
    notes: { type: ["string", "null"] },
  },
  required: ["likes", "retweets", "shares", "comments", "views", "notes"],
};

const RESULT_SCHEMA = {
  type: "object",
  properties: {
    voices: { type: "array", items: VoiceSchema },
    engagement: EngagementSchema,
  },
  required: ["voices", "engagement"],
};

const RESULT_ZOD = z.object({
  voices: z.array(z.object({
    name: z.string().min(1),
    handle: z.string().nullable(),
    platform: z.string().nullable(),
    profession_category: z.enum(["journalist", "activist", "official", "influencer", "community_leader", "politician", "expert", "troll", "commenter", "unknown"]),
    role_guess: z.string().nullable(),
    outlet: z.string().nullable(),
    reach_signal: z.string().nullable(),
    why_they_matter: z.string().nullable(),
    role_in_event: z.enum(["author", "quoted", "mentioned", "commenter"]),
    sentiment: z.number().nullable(),
    confidence: z.number(),
  })),
  engagement: z.object({
    likes: z.number().nullable(),
    retweets: z.number().nullable(),
    shares: z.number().nullable(),
    comments: z.number().nullable(),
    views: z.number().nullable(),
    notes: z.string().nullable(),
  }),
});

const SYSTEM = `You are an intelligence-extraction layer for a political-monitoring platform tracking Arunachal Pradesh.

Given a single event (a social media post, news article, or volunteer-submitted screenshot transcript), extract:

1. EVERY PERSON who appears in the content with a role to play. This includes:
   - The original poster (role_in_event: 'author')
   - People quoted in the post (role_in_event: 'quoted')
   - People mentioned but not quoted (role_in_event: 'mentioned')
   - People visible commenting in the screenshot / comments_text (role_in_event: 'commenter')

   For each person:
   - name: their real name as best you can determine
   - handle: their social media handle if visible (e.g. '@tanahalitara', 'facebook.com/tanahalitara')
   - platform: 'twitter', 'facebook', 'instagram', 'youtube', 'whatsapp', null
   - profession_category: best guess from context — pick ONE
   - role_guess: short ('Tribal rights activist', 'Local journalist', 'Random commenter')
   - outlet: publication they're affiliated with, or null for independents
   - reach_signal: any indicator of audience size visible ('~12k followers', 'verified', 'small account')
   - why_they_matter: 1 sentence on intelligence value. Skip random commenters with nothing distinctive.
   - sentiment: -1 to 1 for what THEY are expressing, or null if neutral / no opinion shown
   - confidence: 0 to 1, how sure you are about the categorisation

   Skip pure noise: known politicians don't need extracting unless they're saying/doing something specific (we already track them). Skip news anchors merely reading copy. Skip orgs (extract individuals from within orgs instead).

2. ENGAGEMENT METRICS visible in the content or screenshots:
   - likes, retweets, shares, comments, views — null if not visible
   - notes: brief observation if you spot patterns ('comments mostly hostile', 'engagement bot-like')

Be conservative. Return [] for voices and null fields for engagement if nothing extractable. Quality over quantity.`;

type EventInput = {
  id: string;
  title: string;
  body: string | null;
  source: string;
  url: string | null;
  comments_text: string | null;
  raw_payload: Record<string, unknown> | null;
};

export async function extractFromEvent(ev: EventInput): Promise<ExtractionResult> {
  const userPayload = {
    title: ev.title,
    body: (ev.body ?? "").slice(0, 3000),
    source: ev.source,
    url: ev.url,
    comments_text: (ev.comments_text ?? "").slice(0, 2000),
    raw_payload_excerpt: (() => {
      // Pass through OCR transcript + first-pass intern hints if present
      if (!ev.raw_payload) return null;
      const pick: Record<string, unknown> = {};
      if (ev.raw_payload.ai_first_pass) pick.ai_first_pass = ev.raw_payload.ai_first_pass;
      if (ev.raw_payload.ocr_transcript) pick.ocr_transcript = String(ev.raw_payload.ocr_transcript).slice(0, 2000);
      if (ev.raw_payload.feed) pick.feed = ev.raw_payload.feed;
      return Object.keys(pick).length > 0 ? pick : null;
    })(),
  };

  const raw = await jsonCall<unknown>({
    model: MODEL_BRIEF,
    system: SYSTEM,
    user: JSON.stringify(userPayload),
    schema: RESULT_SCHEMA,
    toolName: "emit_extraction",
    toolDescription: "Return extracted voices and engagement metrics for this event.",
    temperature: 0.2,
    maxTokens: 3000,
  });

  const parsed = RESULT_ZOD.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`voice-extract schema mismatch: ${parsed.error.message.slice(0, 200)}`);
  }
  return parsed.data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Persistence: take the AI result + match-or-create against existing voices.
// ─────────────────────────────────────────────────────────────────────────────

function normaliseHandle(h: string | null): string | null {
  if (!h) return null;
  return h.toLowerCase().replace(/^@/, "").trim() || null;
}

function normaliseName(n: string): string {
  return n.toLowerCase().replace(/\s+/g, " ").trim();
}

export async function persistExtraction(eventId: string, result: ExtractionResult): Promise<{ created: number; linked: number; engagement_written: boolean }> {
  const admin = createAdminClient();

  // Update event with engagement + extras
  const engagementFields: Record<string, number | string | null> = {};
  for (const k of ["likes", "retweets", "shares", "comments", "views"] as const) {
    if (result.engagement[k] != null) engagementFields[k] = result.engagement[k];
  }
  if (result.engagement.notes) engagementFields.notes = result.engagement.notes;

  const engagement_written = Object.keys(engagementFields).length > 0;
  if (engagement_written) {
    await admin.from("events").update({ engagement: engagementFields }).eq("id", eventId);
  }

  let created = 0;
  let linked = 0;

  // Pull all existing voices once for matching (fine until you have thousands).
  // For Tier-2 scale, swap this for a vector similarity lookup.
  const { data: allVoices } = await admin
    .from("voices")
    .select("id, name, platform_handles, outlet_name")
    .eq("active", true);
  const existing = (allVoices ?? []) as Array<{ id: string; name: string; platform_handles: Record<string, string> | null; outlet_name: string | null }>;

  // Indexes for fast match
  const byName = new Map<string, string>();
  const byHandle = new Map<string, string>(); // 'platform:handle' → voice_id
  for (const v of existing) {
    byName.set(normaliseName(v.name), v.id);
    if (v.platform_handles) {
      for (const [platform, handle] of Object.entries(v.platform_handles)) {
        const norm = normaliseHandle(handle);
        if (norm) byHandle.set(`${platform}:${norm}`, v.id);
      }
    }
  }

  for (const ext of result.voices) {
    if (ext.confidence < 0.4) continue; // skip very-low-confidence noise

    const normName = normaliseName(ext.name);
    const normHandle = normaliseHandle(ext.handle);
    const platformKey = ext.platform && normHandle ? `${ext.platform}:${normHandle}` : null;

    let voiceId: string | null = null;

    // Match by handle first (more reliable than name), then by name.
    if (platformKey && byHandle.has(platformKey)) {
      voiceId = byHandle.get(platformKey)!;
    } else if (byName.has(normName)) {
      voiceId = byName.get(normName)!;
    }

    if (!voiceId) {
      // CREATE
      const platform_handles: Record<string, string> = {};
      if (ext.platform && ext.handle) platform_handles[ext.platform] = ext.handle;
      const { data: ins, error } = await admin.from("voices").insert({
        name: ext.name,
        role: ext.role_guess,
        outlet_name: ext.outlet,
        active: true,
        joined_at: new Date().toISOString().slice(0, 10),
        relationship_status: "unknown",
        auto_extracted: true,
        source_event_id: eventId,
        profession_category: ext.profession_category,
        confidence_score: ext.confidence,
        platform_handles,
        why_they_matter: ext.why_they_matter,
        last_seen_at: new Date().toISOString(),
        // social_handles is the older field shape — keep populated for back-compat
        social_handles: platform_handles,
        notes: ext.reach_signal ? `[auto] reach signal: ${ext.reach_signal}` : null,
      } as Record<string, unknown>).select("id").single();
      if (error || !ins?.id) continue; // skip on insert error; don't abort whole batch
      const newId: string = ins.id;
      voiceId = newId;
      created += 1;

      // Update local indices in case multiple extracted voices have the same handle
      byName.set(normName, newId);
      if (platformKey) byHandle.set(platformKey, newId);
    } else {
      // UPDATE last_seen_at + reach_signal if the new sighting has info
      await admin.from("voices").update({
        last_seen_at: new Date().toISOString(),
      }).eq("id", voiceId);
    }

    // Link voice to event (idempotent on PK)
    const { error: linkErr } = await admin.from("voice_event_links").upsert({
      voice_id: voiceId,
      event_id: eventId,
      role: ext.role_in_event,
      sentiment: ext.sentiment,
      detected_by: "ai_extract",
    }, { onConflict: "voice_id,event_id,role", ignoreDuplicates: true });
    if (!linkErr) linked += 1;
  }

  return { created, linked, engagement_written };
}
