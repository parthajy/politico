import { z } from "zod";
import { jsonCall, MODEL_BRIEF } from "./anthropic";
import { createAdminClient } from "@/lib/supabase/admin";
import { subDays } from "date-fns";

// Tolerant of model variations; we normalise to canonical values below.
const TimeHorizon = z.string().transform((s) => {
  const v = s.toLowerCase().replace(/[\s-]/g, "_");
  if (/24h|24_h|next_24/.test(v) || v === "immediate") return "next_24h" as const;
  if (/7d|7_d|next_7|week/.test(v)) return "next_7d" as const;
  if (/30d|30_d|month/.test(v)) return "next_30d" as const;
  return "next_7d" as const;
});
const Severity = z.string().transform((s) => {
  const v = s.toLowerCase();
  if (v.startsWith("crit")) return "critical" as const;
  if (v.startsWith("high")) return "high" as const;
  if (v.startsWith("med")) return "medium" as const;
  return "low" as const;
});
const Owner = z.string().transform((s) => {
  const v = s.toLowerCase().replace(/[\s-]/g, "_");
  const allowed = ["analyst", "outlet_partner", "voice_network", "minister_office", "cm_office", "external"] as const;
  return (allowed as readonly string[]).includes(v) ? v : "analyst";
});
const Urgency = z.string().transform((s) => {
  const v = s.toLowerCase();
  if (v === "now" || v.startsWith("immed")) return "now" as const;
  if (v.startsWith("today")) return "today" as const;
  return "this_week" as const;
});

export const ThreatItem = z.object({
  title: z.string().min(4),
  description: z.string().min(15),
  time_horizon: TimeHorizon,
  severity: Severity,
});

export const RecommendedAction = z.object({
  action: z.string().min(10),
  owner: Owner,
  urgency: Urgency,
});

export const ThreatAssessment = z.object({
  threat_score: z.number().min(0).max(1),
  threat_band: z.string().transform((s) => {
    const v = s.toLowerCase();
    if (v.startsWith("crit")) return "critical" as const;
    if (v.startsWith("high")) return "high" as const;
    if (v.startsWith("med")) return "medium" as const;
    return "low" as const;
  }),
  headline: z.string().min(8).max(400),
  public_posture: z.string().min(10).max(400),
  threats: z.array(ThreatItem).max(8),
  recommended_actions: z.array(RecommendedAction).max(8),
  evidence_event_ids: z.array(z.string()).max(10),
});
export type ThreatAssessment = z.infer<typeof ThreatAssessment>;

export type ThreatScope = "cm" | "minister" | "constituency";

export type ScopeContext = {
  scope_type: ThreatScope;
  entity_name: string;
  party: string | null;
  is_minister: boolean;
  portfolio: string | null;
  district: string | null;
  constituency: string | null;
  // Recent signal corpus
  signals: { event_id: string; title: string; body: string | null; source: string; snt_score: number; sentiment: number; topic_tags: string[]; published_at: string | null }[];
  sentiment_30d: { date: string; net_sentiment: number }[];
  active_alerts: { severity: string; title: string }[];
};

const SYSTEM = `You are running threat-radar for a senior political consultancy advising the Government of Arunachal Pradesh.

Threat radar is FORWARD-LOOKING risk assessment for a single entity (the CM, an individual minister, or an Assembly constituency). It is NOT a summary of past coverage. You are answering: "what could blow up about this entity in the next 24 hours / 7 days / 30 days, and what should we do pre-emptively?"

Threats to look for:
- Specific allegations gaining traction (legal exposure, CBI/ED/court mentions)
- Coordinated criticism from multiple sources hitting the same angle
- Sentiment dropping fast (>0.3 in 7 days)
- Constituent unrest indicators (protest, strike, bandh, dharna)
- Vulnerability windows (election-adjacent, festival, tribal calendar, monsoon)
- Network effects (criticism of one minister bleeding into the party brand)
- Silent risks (no coverage but volatile baseline)

For each entity return JSON with:
- threat_score (0–1): overall composite. >=0.8 critical, >=0.6 high, >=0.35 medium, else low.
- threat_band: must match the score thresholds above.
- headline: ONE sentence (max ~25 words) the CMO will read on the dashboard. Calm but specific. NEVER alarmist generic ("there are concerns"). Always name the issue.
- public_posture: ONE sentence the principal could literally SAY in public or to a journalist if asked about the issue today. Govt-affirming but credible — not denial, not capitulation. Avoid jargon. Examples: "The government welcomes the Supreme Court's inquiry and will cooperate fully — we have nothing to hide on contract allocations." / "We are working with affected villages in West Kameng to deliver relief teams; no family will be left without support."
- threats: 0-6 specific threats. Each has title (4-7 words), description (1-2 sentences), time_horizon, severity. Skip if there are no real threats — return empty array.
- recommended_actions: 0-6 concrete moves. Each has action (1 sentence, name a specific outlet/voice/constituency where possible), owner (who executes), urgency.
- evidence_event_ids: up to 8 event_ids from the signal corpus that anchor this assessment.

Rules:
- DO NOT manufacture threats. If the entity is genuinely quiet, return threat_band="low" with empty threats[] and a headline like "No active threats; X remains in routine coverage cadence."
- The 'cm' scope means the Chief Minister specifically. Treat with extra weight — anything that touches him is a state-level concern.
- For 'minister' scope, look for individual exposure AND brand-bleeding into the cabinet.
- For 'constituency' scope, consider whether the sitting MLA is implicated; consider local mobilisation.
- Output ONLY through the structured tool — no prose.`;

const SCHEMA = {
  type: "object",
  properties: {
    threat_score: { type: "number" },
    threat_band: { type: "string", enum: ["low", "medium", "high", "critical"] },
    headline: { type: "string" },
    public_posture: { type: "string" },
    threats: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          time_horizon: { type: "string", enum: ["next_24h", "next_7d", "next_30d"] },
          severity: { type: "string", enum: ["low", "medium", "high", "critical"] },
        },
        required: ["title", "description", "time_horizon", "severity"],
      },
    },
    recommended_actions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          action: { type: "string" },
          owner: { type: "string", enum: ["analyst", "outlet_partner", "voice_network", "minister_office", "cm_office", "external"] },
          urgency: { type: "string", enum: ["now", "today", "this_week"] },
        },
        required: ["action", "owner", "urgency"],
      },
    },
    evidence_event_ids: { type: "array", items: { type: "string" } },
  },
  required: ["threat_score", "threat_band", "headline", "public_posture", "threats", "recommended_actions", "evidence_event_ids"],
};

export async function assessThreat(ctx: ScopeContext): Promise<ThreatAssessment> {
  const raw = await jsonCall<unknown>({
    model: MODEL_BRIEF,
    system: SYSTEM,
    user: JSON.stringify({
      scope_type: ctx.scope_type,
      entity: {
        name: ctx.entity_name,
        party: ctx.party,
        is_minister: ctx.is_minister,
        portfolio: ctx.portfolio,
        district: ctx.district,
        constituency: ctx.constituency,
      },
      signals: ctx.signals.map((s) => ({
        event_id: s.event_id,
        title: s.title,
        body: (s.body ?? "").slice(0, 250),
        source: s.source,
        snt_score: s.snt_score,
        sentiment: s.sentiment,
        topic_tags: s.topic_tags,
        published_at: s.published_at,
      })),
      sentiment_30d: ctx.sentiment_30d,
      active_alerts: ctx.active_alerts,
    }),
    schema: SCHEMA,
    toolName: "emit_threat_assessment",
    toolDescription: "Emit the forward-looking threat assessment for this entity.",
    temperature: 0.3,
    maxTokens: 3000,
  });
  const parsed = ThreatAssessment.safeParse(raw);
  if (!parsed.success) throw new Error(`threat schema mismatch: ${parsed.error.message.slice(0, 200)}`);
  // Filter evidence ids to ones we actually sent
  const valid = new Set(ctx.signals.map((s) => s.event_id));
  parsed.data.evidence_event_ids = parsed.data.evidence_event_ids.filter((id) => valid.has(id));
  return parsed.data;
}

// Build the context for a given (scope_type, scope_id).
export async function buildScopeContext(scope_type: ThreatScope, scope_id: number | null): Promise<ScopeContext> {
  const sb = createAdminClient();
  const since = subDays(new Date(), 14).toISOString();
  const sinceDay = subDays(new Date(), 30).toISOString().slice(0, 10);

  if (scope_type === "cm") {
    // CM = the MLA flagged is_cm
    const { data: cm } = await sb.from("mlas").select("id, name, party, portfolio, constituency_id, is_minister, constituencies!mlas_constituency_id_fkey(name, district_id, districts(name))").eq("is_cm", true).limit(1).maybeSingle();
    if (!cm) throw new Error("no CM in mlas table");
    const constJoin = (cm.constituencies as unknown) as { name: string; district_id: number | null; districts: { name: string } | null } | null;

    // Signals: anything mentioning CM by mla_id OR with topic mentioning the CM in the body
    const [byMla, byKeyword] = await Promise.all([
      sb.from("classifications").select("event_id, snt_score, sentiment, topic_tags, events!inner(title, body, source, published_at)")
        .eq("mla_id", cm.id).gte("classified_at", since).order("snt_score", { ascending: false, nullsFirst: false }).limit(15),
      sb.from("classifications").select("event_id, snt_score, sentiment, topic_tags, events!inner(title, body, source, published_at)")
        .ilike("events.title", `%${cm.name}%`).gte("classified_at", since).limit(15),
    ]);
    const signalsMap = new Map<string, { event_id: string; title: string; body: string | null; source: string; snt_score: number; sentiment: number; topic_tags: string[]; published_at: string | null }>();
    for (const r of [...(byMla.data ?? []), ...(byKeyword.data ?? [])]) {
      const ev = (r.events as unknown) as { title: string; body: string | null; source: string; published_at: string | null };
      signalsMap.set(r.event_id, {
        event_id: r.event_id, title: ev.title, body: ev.body, source: ev.source,
        snt_score: Number(r.snt_score ?? 0), sentiment: Number(r.sentiment ?? 0),
        topic_tags: r.topic_tags ?? [], published_at: ev.published_at,
      });
    }

    const [{ data: snaps }, { data: alerts }] = await Promise.all([
      sb.from("sentiment_snapshots").select("date, net_sentiment").eq("scope_type", "minister").eq("scope_id", cm.id).gte("date", sinceDay).order("date"),
      sb.from("alerts").select("severity, title").is("resolved_at", null).order("created_at", { ascending: false }).limit(8),
    ]);

    return {
      scope_type: "cm",
      entity_name: cm.name,
      party: cm.party,
      is_minister: true,
      portfolio: cm.portfolio,
      district: constJoin?.districts?.name ?? null,
      constituency: constJoin?.name ?? null,
      signals: Array.from(signalsMap.values()).slice(0, 25),
      sentiment_30d: (snaps ?? []).map((s) => ({ date: s.date, net_sentiment: Number(s.net_sentiment) })),
      active_alerts: alerts ?? [],
    };
  }

  if (scope_type === "minister") {
    if (!scope_id) throw new Error("minister scope requires scope_id");
    const { data: m } = await sb.from("mlas").select("id, name, party, portfolio, is_minister, constituencies!mlas_constituency_id_fkey(name, district_id, districts(name))").eq("id", scope_id).maybeSingle();
    if (!m) throw new Error("minister not found");
    const constJoin = (m.constituencies as unknown) as { name: string; district_id: number | null; districts: { name: string } | null } | null;

    const [{ data: signals }, { data: snaps }] = await Promise.all([
      sb.from("classifications").select("event_id, snt_score, sentiment, topic_tags, events!inner(title, body, source, published_at)")
        .eq("mla_id", scope_id).gte("classified_at", since).order("snt_score", { ascending: false, nullsFirst: false }).limit(20),
      sb.from("sentiment_snapshots").select("date, net_sentiment").eq("scope_type", "minister").eq("scope_id", scope_id).gte("date", sinceDay).order("date"),
    ]);

    return {
      scope_type: "minister",
      entity_name: m.name,
      party: m.party,
      is_minister: m.is_minister,
      portfolio: m.portfolio,
      district: constJoin?.districts?.name ?? null,
      constituency: constJoin?.name ?? null,
      signals: (signals ?? []).map((r) => {
        const ev = (r.events as unknown) as { title: string; body: string | null; source: string; published_at: string | null };
        return {
          event_id: r.event_id, title: ev.title, body: ev.body, source: ev.source,
          snt_score: Number(r.snt_score ?? 0), sentiment: Number(r.sentiment ?? 0),
          topic_tags: r.topic_tags ?? [], published_at: ev.published_at,
        };
      }),
      sentiment_30d: (snaps ?? []).map((s) => ({ date: s.date, net_sentiment: Number(s.net_sentiment) })),
      active_alerts: [],
    };
  }

  // constituency
  if (!scope_id) throw new Error("constituency scope requires scope_id");
  const { data: c } = await sb.from("constituencies").select("id, name, current_mla_id, mlas!constituencies_mla_fk(name, party, is_minister, portfolio), districts(name)").eq("id", scope_id).maybeSingle();
  if (!c) throw new Error("constituency not found");
  const mlaJoin = (c.mlas as unknown) as { name: string; party: string | null; is_minister: boolean; portfolio: string | null } | null;
  const distJoin = (c.districts as unknown) as { name: string } | null;

  const [{ data: signals }, { data: snaps }] = await Promise.all([
    sb.from("classifications").select("event_id, snt_score, sentiment, topic_tags, events!inner(title, body, source, published_at)")
      .eq("constituency_id", scope_id).gte("classified_at", since).order("snt_score", { ascending: false, nullsFirst: false }).limit(20),
    sb.from("sentiment_snapshots").select("date, net_sentiment").eq("scope_type", "constituency").eq("scope_id", scope_id).gte("date", sinceDay).order("date"),
  ]);

  return {
    scope_type: "constituency",
    entity_name: c.name,
    party: mlaJoin?.party ?? null,
    is_minister: mlaJoin?.is_minister ?? false,
    portfolio: mlaJoin?.portfolio ?? null,
    district: distJoin?.name ?? null,
    constituency: c.name,
    signals: (signals ?? []).map((r) => {
      const ev = (r.events as unknown) as { title: string; body: string | null; source: string; published_at: string | null };
      return {
        event_id: r.event_id, title: ev.title, body: ev.body, source: ev.source,
        snt_score: Number(r.snt_score ?? 0), sentiment: Number(r.sentiment ?? 0),
        topic_tags: r.topic_tags ?? [], published_at: ev.published_at,
      };
    }),
    sentiment_30d: (snaps ?? []).map((s) => ({ date: s.date, net_sentiment: Number(s.net_sentiment) })),
    active_alerts: [],
  };
}
