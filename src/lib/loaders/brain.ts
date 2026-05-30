import { createClient } from "@/lib/supabase/server";
import { subDays } from "date-fns";

// Brain-map data builder.
//
// Returns a force-directed graph: nodes (entities) + links (relationships).
// Five node kinds:
//   - minister      (cabinet members, CM/Dy CM)
//   - constituency  (the 60 AP seats; we cap to those with activity)
//   - district      (the 25 districts)
//   - topic         (top topic tags across the window)
//   - event         (hottest signals by SNT in the window)
//   - narrative     (if we've persisted narratives — optional)
//
// Links:
//   - minister  ↔ constituency  (their seat)
//   - constituency → district   (geographic)
//   - event → constituency      (where it lands)
//   - event → minister          (who it mentions)
//   - event ↔ topic             (its tags)
//
// We optionally focus the graph on a single minister scope — only nodes
// reachable within ~2 hops are returned. This is what the per-minister
// "My brain map" renders.

export type BrainNode = {
  id: string;            // e.g. "min-12", "con-34", "ev-uuid", "top-tag", "dist-3"
  kind: "minister" | "constituency" | "district" | "topic" | "event";
  label: string;
  // Optional metadata for the UI:
  sub?: string;          // subtitle (portfolio, district name, source)
  href?: string;         // click target
  risk_band?: "low" | "medium" | "high" | "critical" | null;
  sentiment?: number | null; // -1..1 for events
  snt_score?: number | null; // 0..1
  size?: number;         // visual size hint
  weight?: number;       // 0..1 — drives node radius
};

export type BrainLink = {
  source: string;
  target: string;
  kind: "seat" | "in_district" | "about" | "tagged_with";
  weight?: number;
};

export type BrainGraph = {
  nodes: BrainNode[];
  links: BrainLink[];
  focus_id: string | null;
};

export type BrainFocus =
  | { kind: "state" }
  | { kind: "minister"; mla_id: number; constituency_id: number | null; district_id: number | null };

export async function loadBrainGraph(focus: BrainFocus, opts: { windowDays?: number; maxEvents?: number; maxTopics?: number } = {}): Promise<BrainGraph> {
  const windowDays = opts.windowDays ?? 30;
  const maxEvents = opts.maxEvents ?? 60;
  const maxTopics = opts.maxTopics ?? 12;

  const sb = createClient();
  const sinceISO = subDays(new Date(), windowDays).toISOString();

  // Pull ministers (focused or all)
  const ministersQ = sb
    .from("mlas")
    .select("id, name, portfolio, is_cm, is_deputy_cm, is_minister, constituency_id, constituencies!mlas_constituency_id_fkey(id, name, district_id, districts(id, name))")
    .eq("is_minister", true);
  const { data: ministers } = focus.kind === "minister"
    ? await ministersQ.eq("id", focus.mla_id)
    : await ministersQ.order("is_cm", { ascending: false }).order("name");

  // Constituencies — for state graph, fetch all; for minister focus, only theirs
  const consQ = sb
    .from("constituencies")
    .select("id, name, district_id, districts(id, name), current_mla_id");
  const { data: cons } = focus.kind === "minister" && focus.constituency_id
    ? await consQ.eq("id", focus.constituency_id)
    : await consQ.order("number");

  // Districts
  const { data: dists } = await sb.from("districts").select("id, name");

  // Threat bands for ministers + constituencies (so we colour them)
  const { data: threats } = await sb
    .from("threat_assessments_summary")
    .select("scope_type, scope_id, threat_band");
  const threatByMla = new Map<number, string>();
  const threatByCon = new Map<number, string>();
  let cmThreat: string | null = null;
  for (const t of threats ?? []) {
    if (t.scope_type === "minister" && t.scope_id != null) threatByMla.set(t.scope_id, t.threat_band);
    if (t.scope_type === "constituency" && t.scope_id != null) threatByCon.set(t.scope_id, t.threat_band);
    if (t.scope_type === "cm") cmThreat = t.threat_band;
  }

  // Classifications — hottest signals in window
  let clsQ = sb
    .from("classifications")
    .select("event_id, snt_score, sentiment, topic_tags, mla_id, constituency_id, district_id, events!inner(id, title, source, published_at, url)")
    .gte("classified_at", sinceISO)
    .order("snt_score", { ascending: false, nullsFirst: false })
    .limit(maxEvents * 2); // overfetch — we may filter
  if (focus.kind === "minister") {
    const s = focus;
    const orParts = [`mla_id.eq.${s.mla_id}`];
    if (s.constituency_id) orParts.push(`constituency_id.eq.${s.constituency_id}`);
    if (s.district_id) orParts.push(`district_id.eq.${s.district_id}`);
    clsQ = clsQ.or(orParts.join(","));
  }
  const { data: cls } = await clsQ;

  // Topic frequency
  const topicCount = new Map<string, number>();
  for (const r of cls ?? []) for (const t of (r.topic_tags ?? []) as string[]) topicCount.set(t, (topicCount.get(t) ?? 0) + 1);
  const topTopics = Array.from(topicCount.entries()).sort((a, b) => b[1] - a[1]).slice(0, maxTopics);

  // Build nodes + links
  const nodes: BrainNode[] = [];
  const links: BrainLink[] = [];
  const seen = new Set<string>();

  const addNode = (n: BrainNode) => {
    if (seen.has(n.id)) return;
    seen.add(n.id);
    nodes.push(n);
  };

  // Strip the "(ST)" / "(SC)" reservation suffix — visual noise on the graph.
  // Keep the underlying name in seed data; just trim it for display labels.
  const cleanName = (s: string) => s.replace(/\s*\((ST|SC|GEN)\)\s*$/i, "").trim();

  // Districts
  for (const d of dists ?? []) {
    addNode({
      id: `dist-${d.id}`,
      kind: "district",
      label: cleanName(d.name),
      href: `/party/district/${d.id}`, // CMO; for ministers the layout will block this if it's not theirs
      weight: 0.35,
    });
  }

  // Constituencies
  for (const c of cons ?? []) {
    const distJoin = (c.districts as unknown) as { id: number; name: string } | null;
    addNode({
      id: `con-${c.id}`,
      kind: "constituency",
      label: cleanName(c.name),
      sub: distJoin?.name ?? undefined,
      href: `/party/constituency/${c.id}`,
      risk_band: (threatByCon.get(c.id) as BrainNode["risk_band"]) ?? null,
      weight: 0.5,
    });
    if (distJoin) {
      links.push({ source: `con-${c.id}`, target: `dist-${distJoin.id}`, kind: "in_district", weight: 0.4 });
    }
  }

  // Ministers
  for (const m of ministers ?? []) {
    const constJoin = (m.constituencies as unknown) as { id: number; name: string; district_id: number | null; districts: { id: number; name: string } | null } | null;
    const band = m.is_cm ? cmThreat : threatByMla.get(m.id);
    addNode({
      id: `min-${m.id}`,
      kind: "minister",
      label: cleanName(m.name),
      sub: m.is_cm ? "Chief Minister" : m.is_deputy_cm ? "Deputy CM" : (m.portfolio ?? "Minister"),
      href: `/party/entity/person/${m.id}`,
      risk_band: (band as BrainNode["risk_band"]) ?? null,
      weight: m.is_cm ? 1.0 : m.is_deputy_cm ? 0.85 : 0.7,
    });
    if (constJoin) {
      // Ensure their constituency node exists even if focus-filtered
      if (!seen.has(`con-${constJoin.id}`)) {
        addNode({
          id: `con-${constJoin.id}`,
          kind: "constituency",
          label: cleanName(constJoin.name),
          sub: constJoin.districts?.name ?? undefined,
          href: `/party/constituency/${constJoin.id}`,
          risk_band: (threatByCon.get(constJoin.id) as BrainNode["risk_band"]) ?? null,
          weight: 0.5,
        });
        if (constJoin.districts && !seen.has(`dist-${constJoin.districts.id}`)) {
          addNode({
            id: `dist-${constJoin.districts.id}`,
            kind: "district",
            label: cleanName(constJoin.districts.name),
            href: `/party/district/${constJoin.districts.id}`,
            weight: 0.35,
          });
        }
        if (constJoin.districts) links.push({ source: `con-${constJoin.id}`, target: `dist-${constJoin.districts.id}`, kind: "in_district", weight: 0.4 });
      }
      links.push({ source: `min-${m.id}`, target: `con-${constJoin.id}`, kind: "seat", weight: 1.0 });
    }
  }

  // Topics
  for (const [tag] of topTopics) {
    addNode({
      id: `top-${tag}`,
      kind: "topic",
      label: tag,
      href: `/party/entity/topic/${encodeURIComponent(tag)}`,
      weight: 0.3,
    });
  }

  // Events — keep the hottest N
  const eventLimit = Math.min(maxEvents, (cls ?? []).length);
  const topEvents = (cls ?? []).slice(0, eventLimit);
  for (const r of topEvents) {
    const ev = (r.events as unknown) as { id: string; title: string; source: string; published_at: string | null; url: string | null };
    const sntScore = Number(r.snt_score ?? 0);
    const sentiment = Number(r.sentiment ?? 0);
    addNode({
      id: `ev-${ev.id}`,
      kind: "event",
      label: ev.title.length > 70 ? ev.title.slice(0, 67) + "…" : ev.title,
      sub: ev.source,
      href: `/party/entity/event/${ev.id}`,
      sentiment,
      snt_score: sntScore,
      weight: 0.25 + sntScore * 0.4,
    });
    if (r.mla_id) {
      // Only link if the minister exists in our node set; otherwise it's noise.
      if (seen.has(`min-${r.mla_id}`)) {
        links.push({ source: `ev-${ev.id}`, target: `min-${r.mla_id}`, kind: "about", weight: 0.7 + sntScore * 0.3 });
      }
    }
    if (r.constituency_id && seen.has(`con-${r.constituency_id}`)) {
      links.push({ source: `ev-${ev.id}`, target: `con-${r.constituency_id}`, kind: "about", weight: 0.5 + sntScore * 0.3 });
    }
    for (const t of (r.topic_tags ?? []) as string[]) {
      if (seen.has(`top-${t}`)) {
        links.push({ source: `ev-${ev.id}`, target: `top-${t}`, kind: "tagged_with", weight: 0.2 });
      }
    }
  }

  return {
    nodes,
    links,
    focus_id: focus.kind === "minister" ? `min-${focus.mla_id}` : null,
  };
}
