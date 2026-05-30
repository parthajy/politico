import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// GET /api/search?q=...
//
// Universal search over the things a user is likely to jump to from the
// command palette: ministers / MLAs, constituencies, districts, topics
// (tag autocomplete), events (by title), narratives (by label).
//
// Returns a flat ranked list grouped by kind, capped at 20 total. Keep this
// fast — every keystroke from the palette hits it.

type Hit = {
  kind: "person" | "constituency" | "district" | "topic" | "event" | "narrative";
  label: string;
  sub?: string;
  href: string;
  score?: number;
};

export async function GET(req: Request) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  const url = new URL(req.url);
  const qRaw = (url.searchParams.get("q") ?? "").trim();
  if (qRaw.length < 2) return NextResponse.json({ ok: true, hits: [] });
  const q = qRaw.slice(0, 80);
  const ilike = `%${q}%`;

  // Determine which app scope to link into (firm vs party). Defaults to /firm
  // for analyst/admin/intern/superadmin; /party for party_viewer (CMO/minister).
  const { data: profile } = await sb.from("users").select("role").eq("id", user.id).single();
  const role = profile?.role as string | undefined;
  const scope = role === "party_viewer" ? "party" : "firm";

  // Fan out queries in parallel — each capped tight for latency.
  const [people, cons, dists, narratives, events] = await Promise.all([
    sb.from("mlas").select("id, name, portfolio, is_minister, is_cm")
      .ilike("name", ilike).limit(6),
    sb.from("constituencies").select("id, name, districts(name)")
      .ilike("name", ilike).limit(6),
    sb.from("districts").select("id, name")
      .ilike("name", ilike).limit(4),
    sb.from("narratives").select("id, label, tier")
      .ilike("label", ilike).eq("status", "active").limit(4),
    sb.from("events").select("id, title, source, published_at")
      .ilike("title", ilike)
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(8),
  ]);

  const hits: Hit[] = [];

  for (const m of people.data ?? []) {
    hits.push({
      kind: "person",
      label: m.name,
      sub: m.is_cm ? "Chief Minister" : m.is_minister ? (m.portfolio ?? "Minister") : "MLA",
      href: `/${scope}/entity/person/${m.id}`,
    });
  }
  for (const c of cons.data ?? []) {
    const dist = (c.districts as unknown) as { name: string } | null;
    hits.push({
      kind: "constituency",
      label: c.name,
      sub: dist?.name ?? undefined,
      href: `/${scope}/constituency/${c.id}`,
    });
  }
  for (const d of dists.data ?? []) {
    hits.push({
      kind: "district",
      label: d.name,
      sub: "District",
      href: `/${scope}/district/${d.id}`,
    });
  }
  // Narratives only available in /firm
  if (scope === "firm") {
    for (const n of narratives.data ?? []) {
      hits.push({
        kind: "narrative",
        label: n.label,
        sub: `Narrative · ${n.tier}`,
        href: `/firm/narratives?tier=${n.tier}`,
      });
    }
  }
  // Topic shortcut — any topic word the user typed becomes a hit
  hits.push({
    kind: "topic",
    label: q,
    sub: "Open topic vault",
    href: `/${scope}/entity/topic/${encodeURIComponent(q)}`,
  });
  for (const ev of events.data ?? []) {
    hits.push({
      kind: "event",
      label: ev.title.length > 80 ? ev.title.slice(0, 78) + "…" : ev.title,
      sub: `${ev.source}${ev.published_at ? " · " + new Date(ev.published_at).toLocaleDateString() : ""}`,
      href: `/${scope}/entity/event/${ev.id}`,
    });
  }

  return NextResponse.json({ ok: true, hits: hits.slice(0, 20) });
}
