import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { auditLog } from "@/lib/audit";
import { suggestStories, type SuggestInput } from "@/lib/ai/story-suggestions";

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

  // Pick top events that are scoped to a district AND don't already have a story attached.
  // We pull more than we need then filter; OK at small N.
  const { data: rows } = await sb
    .from("classifications")
    .select("event_id, snt_score, sentiment, topic_tags, district_id, constituency_id, events!inner(title, body, source)")
    .not("district_id", "is", null)
    .order("snt_score", { ascending: false, nullsFirst: false })
    .limit(20);

  const candidates = (rows ?? []).slice(0, 8);
  if (candidates.length === 0) return NextResponse.json({ ok: true, suggestions: [], ms: 0 });

  // Pull names for districts/constituencies + voices in those districts in one go.
  const districtIds = Array.from(new Set(candidates.map((r) => r.district_id).filter(Boolean) as number[]));
  const constituencyIds = Array.from(new Set(candidates.map((r) => r.constituency_id).filter(Boolean) as number[]));
  const eventIds = candidates.map((r) => r.event_id);

  const [{ data: districts }, { data: constituencies }, { data: voices }, { data: existingStories }] = await Promise.all([
    sb.from("districts").select("id, name").in("id", districtIds),
    constituencyIds.length > 0
      ? sb.from("constituencies").select("id, name").in("id", constituencyIds)
      : Promise.resolve({ data: [] as { id: number; name: string }[] }),
    sb.from("voices").select("name, role, district_id").in("district_id", districtIds).eq("active", true),
    // exclude events that are already a story's source
    sb.from("audit_log").select("entity_id, metadata").eq("action", "story_create").in("entity_id", eventIds),
  ]);

  const distName = new Map((districts ?? []).map((d) => [d.id, d.name]));
  const constName = new Map((constituencies ?? []).map((c) => [c.id, c.name]));
  const voicesByDistrict = new Map<number, { name: string; role: string | null }[]>();
  for (const v of voices ?? []) {
    const list = voicesByDistrict.get(v.district_id!) ?? [];
    list.push({ name: v.name, role: v.role });
    voicesByDistrict.set(v.district_id!, list);
  }
  const alreadyStoryEventIds = new Set((existingStories ?? []).map((s) => s.entity_id));

  const inputs: SuggestInput[] = candidates
    .filter((r) => !alreadyStoryEventIds.has(r.event_id))
    .slice(0, 5) // cap at 5 suggestions per run
    .map((r) => {
      const ev = (r.events as unknown) as { title: string; body: string | null; source: string };
      return {
        event: {
          id: r.event_id,
          title: ev.title,
          body: ev.body,
          source: ev.source,
          snt_score: Number(r.snt_score ?? 0),
          sentiment: Number(r.sentiment ?? 0),
          district: r.district_id ? distName.get(r.district_id) ?? null : null,
          constituency: r.constituency_id ? constName.get(r.constituency_id) ?? null : null,
          topic_tags: r.topic_tags ?? [],
        },
        voices_in_district: r.district_id ? (voicesByDistrict.get(r.district_id) ?? []) : [],
      };
    });

  if (inputs.length === 0) return NextResponse.json({ ok: true, suggestions: [], ms: 0 });

  const t0 = Date.now();
  let suggestions;
  try {
    suggestions = await suggestStories(inputs);
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }

  await auditLog({
    user_id: user.id,
    action: "ai_story_suggest",
    entity_type: "stories",
    metadata: { ms: Date.now() - t0, candidate_count: inputs.length, suggestion_count: suggestions.length },
  });

  // Hydrate with the source event's title + tags for the UI
  const ctxByEvent = new Map(inputs.map((i) => [i.event.id, i]));
  return NextResponse.json({
    ok: true,
    ms: Date.now() - t0,
    suggestions: suggestions.map((s) => {
      const ctx = ctxByEvent.get(s.source_event_id)!;
      return {
        ...s,
        source_event_title: ctx.event.title,
        district: ctx.event.district,
        constituency: ctx.event.constituency,
        snt_score: ctx.event.snt_score,
      };
    }),
  });
}
