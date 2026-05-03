import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { auditLog } from "@/lib/audit";
import { recommendForInbox, type InboxEvent } from "@/lib/ai/inbox-triage";

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

  // Pull top 25 events by SNT, joined with names + triage status.
  const { data: rows, error } = await sb
    .from("classifications")
    .select(`
      event_id, snt_score, sentiment, topic_tags,
      events!inner(title, body, source, published_at),
      districts(name), constituencies(name)
    `)
    .order("snt_score", { ascending: false, nullsFirst: false })
    .limit(25);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const eventIds = (rows ?? []).map((r) => r.event_id);
  const triageByEvent = new Map<string, string>();
  if (eventIds.length > 0) {
    const { data: triage } = await sb.from("triage").select("event_id, status").in("event_id", eventIds);
    for (const t of triage ?? []) triageByEvent.set(t.event_id, t.status);
  }

  const events: InboxEvent[] = (rows ?? []).map((r) => {
    const ev = (r.events as unknown) as { title: string; body: string | null; source: string; published_at: string | null };
    return {
      event_id: r.event_id,
      title: ev.title,
      body: ev.body,
      source: ev.source,
      snt_score: r.snt_score,
      sentiment: r.sentiment,
      district: ((r.districts as unknown) as { name: string } | null)?.name ?? null,
      constituency: ((r.constituencies as unknown) as { name: string } | null)?.name ?? null,
      topic_tags: r.topic_tags ?? [],
      triage_status: triageByEvent.get(r.event_id) ?? "new",
      published_at: ev.published_at,
    };
  });

  const t0 = Date.now();
  let recs;
  try {
    recs = await recommendForInbox(events);
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }

  await auditLog({
    user_id: user.id,
    action: "ai_inbox_recommend",
    entity_type: "inbox",
    metadata: { ms: Date.now() - t0, event_count: events.length, rec_count: recs.length },
  });

  // Hydrate recs with the title + tags for the UI
  const titleByEvent = new Map(events.map((e) => [e.event_id, e]));
  return NextResponse.json({
    ok: true,
    ms: Date.now() - t0,
    recommendations: recs.map((r) => {
      const ev = titleByEvent.get(r.event_id)!;
      return {
        ...r,
        title: ev.title,
        snt_score: ev.snt_score,
        sentiment: ev.sentiment,
        district: ev.district,
        constituency: ev.constituency,
        triage_status: ev.triage_status,
        source: ev.source,
      };
    }),
  });
}
