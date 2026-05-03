import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { auditLog } from "@/lib/audit";
import { detectNarratives, type NarrativeInput } from "@/lib/ai/narratives";
import { subDays } from "date-fns";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  const { data: profile } = await sb.from("users").select("role").eq("id", user.id).single();
  if (profile?.role !== "firm_admin" && profile?.role !== "firm_analyst") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const since = subDays(new Date(), 7).toISOString();
  const { data: rows } = await sb
    .from("classifications")
    .select("event_id, snt_score, sentiment, topic_tags, events!inner(title, body, source, published_at), districts(name), constituencies(name)")
    .gte("classified_at", since)
    .order("snt_score", { ascending: false, nullsFirst: false })
    .limit(60);

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

  const t0 = Date.now();
  let narratives;
  try {
    narratives = await detectNarratives(events);
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }

  await auditLog({
    user_id: user.id,
    action: "ai_narratives",
    entity_type: "narratives",
    metadata: { ms: Date.now() - t0, event_count: events.length, narrative_count: narratives.length },
  });

  // Hydrate key_event_ids with titles for the UI
  const byId = new Map(events.map((e) => [e.event_id, e]));
  return NextResponse.json({
    ok: true,
    ms: Date.now() - t0,
    narratives: narratives.map((n) => ({
      ...n,
      key_events: n.key_event_ids.map((id) => {
        const e = byId.get(id);
        return e ? { event_id: id, title: e.title, constituency: e.constituency, district: e.district, sentiment: e.sentiment } : null;
      }).filter(Boolean),
    })),
  });
}
