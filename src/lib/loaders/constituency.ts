import { createClient } from "@/lib/supabase/server";
import { subDays } from "date-fns";
import type { ConstituencyData } from "@/components/constituency-view";

export async function loadConstituency(id: number): Promise<ConstituencyData | null> {
  const sb = createClient();
  const { data: c } = await sb
    .from("constituencies")
    .select("id, name, number, last_election_margin_pct, district_id, current_mla_id")
    .eq("id", id)
    .maybeSingle();
  if (!c) return null;

  const [districtRes, mlaRes] = await Promise.all([
    c.district_id
      ? sb.from("districts").select("id, name, tier, dominant_communities").eq("id", c.district_id).maybeSingle()
      : Promise.resolve({ data: null }),
    c.current_mla_id
      ? sb.from("mlas").select("id, name, party, is_minister, portfolio, is_cm, is_deputy_cm").eq("id", c.current_mla_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const since30 = subDays(new Date(), 30).toISOString();

  const [eventsRes, trendRes, voicesRes, storiesRes] = await Promise.all([
    sb
      .from("classifications")
      .select("event_id, snt_score, sentiment, events!inner(id, title, source, published_at, url)")
      .eq("constituency_id", id)
      .gte("classified_at", since30)
      .order("snt_score", { ascending: false, nullsFirst: false })
      .limit(15),
    sb
      .from("sentiment_snapshots")
      .select("date, net_sentiment")
      .eq("scope_type", "constituency")
      .eq("scope_id", id)
      .gte("date", subDays(new Date(), 30).toISOString().slice(0, 10))
      .order("date", { ascending: true }),
    c.district_id
      ? sb
          .from("voices")
          .select("id, name, role, active, ever_paid, ever_scripted")
          .eq("district_id", c.district_id)
          .eq("active", true)
          .limit(8)
      : Promise.resolve({ data: [] as ConstituencyData["voices"] }),
    sb
      .from("stories")
      .select("id, title, status, outlet, reach_estimate")
      .eq("constituency_id", id)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  // If the constituency-level trend is empty, fall back to the state trend so chart isn't flat-line zero.
  let trend = (trendRes.data ?? []).map((r) => ({ date: r.date, value: Number(r.net_sentiment) }));
  if (trend.length === 0) {
    const { data: state } = await sb
      .from("sentiment_snapshots")
      .select("date, net_sentiment")
      .eq("scope_type", "state")
      .gte("date", subDays(new Date(), 30).toISOString().slice(0, 10))
      .order("date", { ascending: true });
    trend = (state ?? []).map((r) => ({ date: r.date, value: Number(r.net_sentiment) }));
  }

  return {
    constituency: { id: c.id, name: c.name, number: c.number, last_election_margin_pct: c.last_election_margin_pct },
    district: districtRes.data ?? null,
    mla: mlaRes.data ?? null,
    recent_events: (eventsRes.data ?? []).map((r) => {
      const ev = (r.events as unknown) as { id: string; title: string; source: string; published_at: string | null; url: string | null };
      return { id: ev.id, title: ev.title, source: ev.source, snt_score: r.snt_score, sentiment: r.sentiment, published_at: ev.published_at, url: ev.url };
    }),
    trend,
    voices: voicesRes.data ?? [],
    stories: storiesRes.data ?? [],
  };
}
