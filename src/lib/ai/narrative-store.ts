import { createAdminClient } from "@/lib/supabase/admin";
import { subDays, subHours } from "date-fns";
import { detectNarratives, type Narrative, type NarrativeInput } from "./narratives";
import { jsonCall, MODEL_BRIEF } from "./anthropic";
import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// Persistent narratives layer.
//
// detectNarratives() (the AI call) is pure — give it events, get back
// clusters. This file is the layer ABOVE that: it persists clusters,
// matches new clusters against existing narratives (so "Hydropower vs land
// rights" becomes ONE evolving narrative across many runs, not a fresh
// one every time), assigns tiers (urgent / forming / established / decaying /
// dormant), and snapshots revisions when narratives change shape.
// ─────────────────────────────────────────────────────────────────────────────

export type Tier = "urgent" | "forming" | "established" | "decaying" | "dormant";

export type StoredNarrative = {
  id: number;
  label: string;
  summary: string;
  sentiment_lean: "hostile" | "mixed" | "supportive";
  trajectory: "rising" | "steady" | "fading";
  tier: Tier;
  status: "active" | "archived";
  recommended_response: string | null;
  first_seen_at: string;
  last_updated_at: string;
  last_event_at: string | null;
  event_count: number;
  peak_snt: number | null;
};

export type WindowMode = "urgent_24h" | "forming_7d" | "review_30d";

const WINDOW_DAYS: Record<WindowMode, number> = {
  urgent_24h: 1,
  forming_7d: 7,
  review_30d: 30,
};

// ─────────────────────────────────────────────────────────────────────────────
// Match-or-create: for each freshly-detected narrative, decide whether it
// extends an EXISTING active narrative (same theme, different events) or is
// genuinely new. We do this in a single Claude call with the existing
// active narratives and the new candidates side by side.
// ─────────────────────────────────────────────────────────────────────────────

const MatchSchema = {
  type: "object",
  properties: {
    matches: {
      type: "array",
      items: {
        type: "object",
        properties: {
          candidate_label: { type: "string" },
          // Either an existing narrative id this candidate extends, or null = create new
          matched_id: { type: ["integer", "null"] },
          merge_reason: { type: "string" },
        },
        required: ["candidate_label", "matched_id", "merge_reason"],
      },
    },
  },
  required: ["matches"],
};
type MatchResult = { matches: { candidate_label: string; matched_id: number | null; merge_reason: string }[] };

async function matchAgainstExisting(
  candidates: Narrative[],
  existing: StoredNarrative[],
): Promise<MatchResult["matches"]> {
  if (existing.length === 0) {
    return candidates.map((c) => ({ candidate_label: c.label, matched_id: null, merge_reason: "first cluster" }));
  }
  const out = await jsonCall<MatchResult>({
    model: MODEL_BRIEF,
    system:
      "You are deduplicating political-intelligence narratives.\n" +
      "For each NEW candidate, decide whether it is a continuation of an EXISTING active narrative " +
      "(same underlying storyline, just newer events) or a genuinely new narrative.\n" +
      "Match generously — different wording for the same storyline = match. Only mark as new if the underlying THEME is distinct.\n" +
      "Return matched_id of the existing narrative when extending, or null when new.\n" +
      "Include a one-sentence merge_reason explaining the decision.",
    user: JSON.stringify({
      existing: existing.map((n) => ({ id: n.id, label: n.label, summary: n.summary, tier: n.tier })),
      candidates: candidates.map((c) => ({ label: c.label, summary: c.summary, sentiment_lean: c.sentiment_lean })),
    }),
    schema: MatchSchema,
    toolName: "emit_matches",
    toolDescription: "Decide which candidates extend existing narratives.",
    temperature: 0.2,
    maxTokens: 1500,
  });
  // Validate shape with zod for safety
  const parsed = z.object({
    matches: z.array(z.object({
      candidate_label: z.string(),
      matched_id: z.number().nullable(),
      merge_reason: z.string(),
    })),
  }).safeParse(out);
  return parsed.success ? parsed.data.matches : candidates.map((c) => ({ candidate_label: c.label, matched_id: null, merge_reason: "match call failed; treating as new" }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Tier classification — given a narrative's metrics, decide its current tier.
// Mechanical, no AI needed.
// ─────────────────────────────────────────────────────────────────────────────

export function classifyTier(args: {
  event_count: number;
  events_last_24h: number;
  events_last_7d: number;
  events_last_30d: number;
  peak_snt: number;
  sentiment_lean: string;
  trajectory: string;
  last_event_at: string | null;
}): Tier {
  const ageDaysSinceLastEvent = args.last_event_at
    ? (Date.now() - new Date(args.last_event_at).getTime()) / (1000 * 60 * 60 * 24)
    : 999;

  // Dormant: no new event in the last 14 days
  if (ageDaysSinceLastEvent > 14) return "dormant";
  // Urgent: at least 3 high-quality events in last 24h AND hostile-leaning AND high peak SNT
  if (args.events_last_24h >= 3 && args.peak_snt >= 0.75 && args.sentiment_lean === "hostile") return "urgent";
  // Decaying: was strong (≥10 events overall) but barely moving now (<2 events/week)
  if (args.event_count >= 10 && args.events_last_7d < 2 && args.trajectory === "fading") return "decaying";
  // Established: 10+ events over 30d window
  if (args.events_last_30d >= 10) return "established";
  // Default: forming
  return "forming";
}

// ─────────────────────────────────────────────────────────────────────────────
// Main entry — run a fresh detection and persist + evolve.
// ─────────────────────────────────────────────────────────────────────────────

export async function detectAndPersist(opts: { mode: WindowMode; triggered_by: string | null }) {
  const admin = createAdminClient();
  const days = WINDOW_DAYS[opts.mode];
  const since = subDays(new Date(), days).toISOString();

  // Pull recent signals
  const { data: rows } = await admin
    .from("classifications")
    .select(`
      event_id, snt_score, sentiment, topic_tags,
      events!inner ( title, body, source, published_at ),
      districts ( name ), constituencies ( name )
    `)
    .gte("classified_at", since)
    .order("snt_score", { ascending: false, nullsFirst: false })
    .limit(opts.mode === "urgent_24h" ? 30 : opts.mode === "forming_7d" ? 60 : 120);

  const events: NarrativeInput[] = (rows ?? []).map((r) => {
    const ev = (r.events as unknown) as { title: string; body: string | null; source: string; published_at: string | null };
    return {
      event_id: r.event_id, title: ev.title, body: ev.body, source: ev.source,
      snt_score: r.snt_score, sentiment: r.sentiment,
      district: ((r.districts as unknown) as { name: string } | null)?.name ?? null,
      constituency: ((r.constituencies as unknown) as { name: string } | null)?.name ?? null,
      topic_tags: r.topic_tags ?? [], published_at: ev.published_at,
    };
  });

  if (events.length < 3) {
    return { ok: true, mode: opts.mode, detected: 0, persisted: 0, note: "Not enough signals in window." };
  }

  // 1) Detect fresh narratives via Claude
  const candidates = await detectNarratives(events);
  if (candidates.length === 0) {
    return { ok: true, mode: opts.mode, detected: 0, persisted: 0 };
  }

  // 2) Pull existing active narratives for match-or-create
  const { data: existingRows } = await admin
    .from("narratives")
    .select("*")
    .eq("status", "active")
    .order("last_updated_at", { ascending: false });
  const existing = (existingRows ?? []) as StoredNarrative[];

  const matches = await matchAgainstExisting(candidates, existing);

  // 3) For each candidate: update or create
  const eventsById = new Map(events.map((e) => [e.event_id, e]));
  let updated = 0;
  let created = 0;

  for (const candidate of candidates) {
    const match = matches.find((m) => m.candidate_label === candidate.label);
    const matchedId = match?.matched_id ?? null;
    const validEventIds = candidate.key_event_ids.filter((id) => eventsById.has(id));
    if (validEventIds.length === 0) continue;

    const sntValues = validEventIds.map((id) => Number(eventsById.get(id)?.snt_score ?? 0));
    const peakSnt = sntValues.length > 0 ? Math.max(...sntValues) : 0;
    const lastEventAt = validEventIds
      .map((id) => eventsById.get(id)?.published_at)
      .filter(Boolean)
      .sort()
      .pop() ?? new Date().toISOString();

    if (matchedId) {
      // UPDATE — extend existing narrative
      // Snapshot prior state first
      const prev = existing.find((e) => e.id === matchedId);
      if (prev) {
        await admin.from("narrative_revisions").insert({
          narrative_id: prev.id,
          label: prev.label,
          summary: prev.summary,
          tier: prev.tier,
          trajectory: prev.trajectory,
          sentiment_lean: prev.sentiment_lean,
          event_count_at_revision: prev.event_count,
          reason: `merged with new cluster: ${candidate.label}`,
        });
      }

      // Add the new event links (ignore duplicates via on conflict)
      await admin.from("narrative_events").upsert(
        validEventIds.map((eid) => ({ narrative_id: matchedId, event_id: eid, weight: 1.0 })),
        { onConflict: "narrative_id,event_id", ignoreDuplicates: true },
      );

      // Recompute event_count + tier
      const { count: totalEvents } = await admin
        .from("narrative_events")
        .select("event_id", { count: "exact", head: true })
        .eq("narrative_id", matchedId);

      const counts = await countEventsInWindows(matchedId);
      const newTier = classifyTier({
        event_count: totalEvents ?? 0,
        events_last_24h: counts.day,
        events_last_7d: counts.week,
        events_last_30d: counts.month,
        peak_snt: Math.max(prev?.peak_snt ?? 0, peakSnt),
        sentiment_lean: candidate.sentiment_lean,
        trajectory: candidate.trajectory,
        last_event_at: lastEventAt,
      });

      await admin.from("narratives").update({
        // Keep the original label unless the new one is clearly more refined.
        // Update summary + sentiment + trajectory + tier + counts + timestamps.
        summary: candidate.summary,
        sentiment_lean: candidate.sentiment_lean,
        trajectory: candidate.trajectory,
        tier: newTier,
        recommended_response: candidate.recommended_response,
        event_count: totalEvents ?? 0,
        peak_snt: Math.max(prev?.peak_snt ?? 0, peakSnt),
        last_event_at: lastEventAt,
        last_updated_at: new Date().toISOString(),
      }).eq("id", matchedId);
      updated += 1;
    } else {
      // CREATE — new narrative
      const newTier = classifyTier({
        event_count: validEventIds.length,
        events_last_24h: validEventIds.filter((id) => {
          const t = eventsById.get(id)?.published_at;
          return t && new Date(t) >= subHours(new Date(), 24);
        }).length,
        events_last_7d: validEventIds.filter((id) => {
          const t = eventsById.get(id)?.published_at;
          return t && new Date(t) >= subDays(new Date(), 7);
        }).length,
        events_last_30d: validEventIds.length,
        peak_snt: peakSnt,
        sentiment_lean: candidate.sentiment_lean,
        trajectory: candidate.trajectory,
        last_event_at: lastEventAt,
      });

      const { data: inserted, error: insErr } = await admin.from("narratives").insert({
        label: candidate.label,
        summary: candidate.summary,
        sentiment_lean: candidate.sentiment_lean,
        trajectory: candidate.trajectory,
        tier: newTier,
        recommended_response: candidate.recommended_response,
        event_count: validEventIds.length,
        peak_snt: peakSnt,
        last_event_at: lastEventAt,
        metadata: { detected_in: opts.mode, triggered_by: opts.triggered_by },
      }).select("id").single();
      if (insErr || !inserted) continue;
      await admin.from("narrative_events").insert(
        validEventIds.map((eid) => ({ narrative_id: inserted.id, event_id: eid, weight: 1.0 })),
      );
      // Snapshot the initial state as revision 1
      await admin.from("narrative_revisions").insert({
        narrative_id: inserted.id,
        label: candidate.label,
        summary: candidate.summary,
        tier: newTier,
        trajectory: candidate.trajectory,
        sentiment_lean: candidate.sentiment_lean,
        event_count_at_revision: validEventIds.length,
        reason: "initial detection",
      });
      created += 1;
    }
  }

  // 4) Decay sweep — any narrative whose last_event_at is >14 days old gets
  //    tier='dormant' regardless of what just happened.
  const dormantCutoff = subDays(new Date(), 14).toISOString();
  await admin
    .from("narratives")
    .update({ tier: "dormant" })
    .lt("last_event_at", dormantCutoff)
    .neq("tier", "dormant")
    .eq("status", "active");

  return { ok: true, mode: opts.mode, detected: candidates.length, persisted: updated + created, updated, created };
}

async function countEventsInWindows(narrativeId: number): Promise<{ day: number; week: number; month: number }> {
  const admin = createAdminClient();
  // Pull all event_ids for this narrative, then count via events.published_at
  const { data: links } = await admin
    .from("narrative_events")
    .select("event_id, events!inner(published_at)")
    .eq("narrative_id", narrativeId);
  if (!links) return { day: 0, week: 0, month: 0 };
  const dayCutoff = subHours(new Date(), 24).getTime();
  const weekCutoff = subDays(new Date(), 7).getTime();
  const monthCutoff = subDays(new Date(), 30).getTime();
  let day = 0, week = 0, month = 0;
  for (const l of links) {
    const ev = (l.events as unknown) as { published_at: string | null };
    if (!ev?.published_at) continue;
    const t = new Date(ev.published_at).getTime();
    if (t >= dayCutoff) day += 1;
    if (t >= weekCutoff) week += 1;
    if (t >= monthCutoff) month += 1;
  }
  return { day, week, month };
}
