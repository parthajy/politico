import { createClient } from "@/lib/supabase/server";
import { subDays } from "date-fns";

// Aggregate everything Samvidya knows about a single entity (person, district,
// constituency, or topic) into one timeline. The "memory vault" — Stage 1.

export type EntityScope = "person" | "district" | "constituency" | "topic";

export type EntityHeader = {
  scope: EntityScope;
  id: string;            // numeric id stringified, or topic slug
  display_name: string;
  subtitle: string | null;
  badges: { label: string; tone: "navy" | "bronze" | "default" }[];
};

export type TimelineItem =
  | { kind: "event"; id: string; date: string; title: string; source: string; url: string | null; snt_score: number | null; sentiment: number | null; topic_tags: string[] }
  | { kind: "decision"; id: string; date: string; title: string; summary: string | null; kind_label: string; outcome: string | null }
  | { kind: "story"; id: string; date: string; title: string; outlet: string | null; status: string; url: string | null }
  | { kind: "alert"; id: string; date: string; title: string; severity: "s1" | "s2" | "s3"; resolved: boolean }
  | { kind: "threat"; id: string; date: string; band: string; headline: string }
  | { kind: "snapshot"; id: string; date: string; net_sentiment: number };

export type EntityAggregate = {
  header: EntityHeader;
  signal_count_30d: number;
  negative_count_30d: number;
  net_sentiment_today: number | null;
  related_voices: { id: string; name: string; role: string | null; placement_count: number | null }[];
  timeline: TimelineItem[];
};

export async function loadEntity(scope: EntityScope, idOrSlug: string): Promise<EntityAggregate | null> {
  const sb = createClient();
  const since30 = subDays(new Date(), 30).toISOString();
  const since30day = since30.slice(0, 10);

  let header: EntityHeader | null = null;
  // Filters captured as plain field/value pairs to avoid TS gymnastics around
  // the Supabase query builder generics
  let eventFilter: { column: string; value: unknown; isContains?: boolean } | null = null;
  let snapScopeType: string | null = null;
  let snapScopeId: number | null = null;
  let threatScopeType: "cm" | "minister" | "constituency" | null = null;
  let threatScopeId: number | null = null;
  let decisionFilter: { scope_type: string; scope_id: number } | null = null;
  let storyFilter: { column: string; value: number } | null = null;
  let voicesQuery: { district_id: number } | null = null;

  if (scope === "person") {
    const id = parseInt(idOrSlug, 10);
    if (Number.isNaN(id)) return null;
    const { data: mla } = await sb
      .from("mlas")
      .select("id, name, party, portfolio, is_cm, is_deputy_cm, is_minister, constituency_id, constituencies!mlas_constituency_id_fkey(name, district_id, districts(name))")
      .eq("id", id)
      .maybeSingle();
    if (!mla) return null;
    const constJoin = (mla.constituencies as unknown) as { name: string; district_id: number | null; districts: { name: string } | null } | null;
    const badges: EntityHeader["badges"] = [];
    if (mla.is_cm) badges.push({ label: "Chief Minister", tone: "bronze" });
    if (mla.is_deputy_cm) badges.push({ label: "Deputy CM", tone: "bronze" });
    if (mla.is_minister && !mla.is_cm && !mla.is_deputy_cm) badges.push({ label: "Minister", tone: "default" });
    if (mla.party) badges.push({ label: mla.party, tone: "navy" });
    header = {
      scope, id: String(id), display_name: mla.name,
      subtitle: [constJoin?.name, constJoin?.districts?.name, mla.portfolio?.split(";")[0]].filter(Boolean).join(" · ") || null,
      badges,
    };
    eventFilter = { column: "mla_id", value: id };
    threatScopeType = mla.is_cm ? "cm" : "minister";
    threatScopeId = mla.is_cm ? null : id;
    snapScopeType = "minister";
    snapScopeId = id;
    decisionFilter = { scope_type: mla.is_cm ? "cm" : "minister", scope_id: id };
    if (constJoin?.district_id) {
      voicesQuery = { district_id: constJoin.district_id };
      storyFilter = { column: "constituency_id", value: mla.constituency_id ?? -1 };
    }
  } else if (scope === "district") {
    const id = parseInt(idOrSlug, 10);
    if (Number.isNaN(id)) return null;
    const { data: d } = await sb.from("districts").select("id, name, hq, tier, dominant_communities").eq("id", id).maybeSingle();
    if (!d) return null;
    const badges: EntityHeader["badges"] = [];
    if (d.tier) badges.push({ label: `Tier ${d.tier}`, tone: d.tier === 1 ? "bronze" : "default" });
    header = {
      scope, id: String(id), display_name: d.name,
      subtitle: [d.hq && `HQ: ${d.hq}`, d.dominant_communities?.length && d.dominant_communities.slice(0, 3).join(", ")].filter(Boolean).join(" · ") || null,
      badges,
    };
    eventFilter = { column: "district_id", value: id };
    snapScopeType = "district";
    snapScopeId = id;
    voicesQuery = { district_id: id };
    storyFilter = { column: "district_id", value: id };
  } else if (scope === "constituency") {
    const id = parseInt(idOrSlug, 10);
    if (Number.isNaN(id)) return null;
    const { data: c } = await sb
      .from("constituencies")
      .select("id, name, number, mlas!constituencies_mla_fk(name, party), districts(id, name)")
      .eq("id", id)
      .maybeSingle();
    if (!c) return null;
    const mla = (c.mlas as unknown) as { name: string; party: string | null } | null;
    const dist = (c.districts as unknown) as { id: number; name: string } | null;
    header = {
      scope, id: String(id), display_name: c.name,
      subtitle: [`Seat #${c.number}`, dist?.name, mla?.name && `MLA: ${mla.name} (${mla.party ?? "—"})`].filter(Boolean).join(" · ") || null,
      badges: [],
    };
    eventFilter = { column: "constituency_id", value: id };
    snapScopeType = "constituency";
    snapScopeId = id;
    threatScopeType = "constituency";
    threatScopeId = id;
    decisionFilter = { scope_type: "constituency", scope_id: id };
    if (dist?.id) voicesQuery = { district_id: dist.id };
    storyFilter = { column: "constituency_id", value: id };
  } else if (scope === "topic") {
    // Topic tags are free-form strings; we match by topic name as URL-encoded slug → human-readable
    const topic = decodeURIComponent(idOrSlug);
    header = {
      scope, id: idOrSlug, display_name: topic,
      subtitle: "Topic — events tagged with this label across all districts",
      badges: [{ label: "Topic", tone: "navy" }],
    };
    eventFilter = { column: "topic_tags", value: [topic], isContains: true };
  }

  if (!header || !eventFilter) return null;

  // Pull recent classified events
  let eventsQuery = sb.from("classifications")
    .select("event_id, snt_score, sentiment, topic_tags, events!inner(id, title, source, published_at, url)")
    .gte("classified_at", since30);
  if (eventFilter.isContains) {
    eventsQuery = eventsQuery.contains(eventFilter.column, eventFilter.value as unknown[]);
  } else {
    eventsQuery = eventsQuery.eq(eventFilter.column, eventFilter.value as string | number);
  }
  const { data: eventRows } = await eventsQuery
    .order("snt_score", { ascending: false, nullsFirst: false })
    .limit(40);

  const events: TimelineItem[] = (eventRows ?? []).map((r) => {
    const ev = (r.events as unknown) as { id: string; title: string; source: string; published_at: string | null; url: string | null };
    return {
      kind: "event" as const,
      id: ev.id,
      date: ev.published_at ?? new Date().toISOString(),
      title: ev.title,
      source: ev.source,
      url: ev.url,
      snt_score: r.snt_score,
      sentiment: r.sentiment,
      topic_tags: r.topic_tags ?? [],
    };
  });

  const negativeCount = (eventRows ?? []).filter((r) => Number(r.sentiment) < -0.15).length;

  // Snapshot for today (if scope supports it)
  let netToday: number | null = null;
  if (snapScopeType) {
    const { data: snap } = snapScopeId
      ? await sb.from("sentiment_snapshots").select("net_sentiment").eq("scope_type", snapScopeType).eq("scope_id", snapScopeId).gte("date", since30day).order("date", { ascending: false }).limit(1).maybeSingle()
      : await sb.from("sentiment_snapshots").select("net_sentiment").eq("scope_type", snapScopeType).is("scope_id", null).gte("date", since30day).order("date", { ascending: false }).limit(1).maybeSingle();
    netToday = snap?.net_sentiment != null ? Number(snap.net_sentiment) : null;
  }

  // Decisions
  let decisions: TimelineItem[] = [];
  if (decisionFilter) {
    const { data: d } = await sb
      .from("decisions")
      .select("id, title, summary, kind, decided_on, outcome")
      .eq("scope_type", decisionFilter.scope_type)
      .eq("scope_id", decisionFilter.scope_id)
      .order("decided_on", { ascending: false })
      .limit(20);
    decisions = (d ?? []).map((r) => ({
      kind: "decision" as const,
      id: r.id,
      date: new Date(r.decided_on).toISOString(),
      title: r.title,
      summary: r.summary,
      kind_label: r.kind,
      outcome: r.outcome,
    }));
  }

  // Stories
  let stories: TimelineItem[] = [];
  if (storyFilter) {
    const { data: s } = await sb
      .from("stories")
      .select("id, title, outlet, status, url, published_at, created_at")
      .eq(storyFilter.column, storyFilter.value)
      .order("created_at", { ascending: false })
      .limit(15);
    stories = (s ?? []).map((r) => ({
      kind: "story" as const,
      id: r.id,
      date: r.published_at ?? r.created_at,
      title: r.title,
      outlet: r.outlet,
      status: r.status,
      url: r.url,
    }));
  }

  // Alerts (only if there's an eventFilter — alerts attached via event_id)
  let alerts: TimelineItem[] = [];
  if (eventRows && eventRows.length > 0) {
    const eventIds = eventRows.map((r) => r.event_id);
    const { data: a } = await sb
      .from("alerts")
      .select("id, title, severity, created_at, resolved_at")
      .in("event_id", eventIds)
      .order("created_at", { ascending: false })
      .limit(15);
    alerts = (a ?? []).map((r) => ({
      kind: "alert" as const,
      id: r.id,
      date: r.created_at,
      title: r.title,
      severity: (r.severity as "s1" | "s2" | "s3") ?? "s3",
      resolved: !!r.resolved_at,
    }));
  }

  // Threat assessment (latest)
  const threat: TimelineItem[] = [];
  if (threatScopeType) {
    const q = sb.from("threat_assessments_summary").select("id, threat_band, headline, generated_at").eq("scope_type", threatScopeType);
    const { data: t } = threatScopeId == null
      ? await q.is("scope_id", null).limit(1).maybeSingle()
      : await q.eq("scope_id", threatScopeId).limit(1).maybeSingle();
    if (t) threat.push({
      kind: "threat", id: t.id, date: t.generated_at, band: t.threat_band, headline: t.headline,
    });
  }

  // Sentiment snapshots — last 30 days, every 5 days for the timeline
  let snapshots: TimelineItem[] = [];
  if (snapScopeType) {
    const q = sb.from("sentiment_snapshots").select("id, date, net_sentiment").eq("scope_type", snapScopeType).gte("date", since30day).order("date", { ascending: false });
    const { data: snaps } = snapScopeId == null
      ? await q.is("scope_id", null)
      : await q.eq("scope_id", snapScopeId);
    snapshots = (snaps ?? []).filter((_, i) => i % 5 === 0).slice(0, 6).map((r) => ({
      kind: "snapshot" as const,
      id: String(r.id),
      date: new Date(r.date).toISOString(),
      net_sentiment: Number(r.net_sentiment),
    }));
  }

  // Voices in scope
  let related_voices: EntityAggregate["related_voices"] = [];
  if (voicesQuery) {
    const { data: v } = await sb
      .from("voices")
      .select("id, name, role, placement_count")
      .eq("district_id", voicesQuery.district_id)
      .eq("active", true)
      .order("placement_count", { ascending: false, nullsFirst: false })
      .order("reach_estimate", { ascending: false, nullsFirst: false })
      .limit(6);
    related_voices = (v ?? []).map((r) => ({ id: r.id, name: r.name, role: r.role, placement_count: r.placement_count }));
  }

  // Merge + sort timeline newest-first
  const timeline = [...events, ...decisions, ...stories, ...alerts, ...threat, ...snapshots]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 60);

  return {
    header,
    signal_count_30d: events.length,
    negative_count_30d: negativeCount,
    net_sentiment_today: netToday,
    related_voices,
    timeline,
  };
}
