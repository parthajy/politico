import { createClient } from "@/lib/supabase/server";
import { InboxClient } from "./inbox-client";
import { TodaysCall } from "./todays-call";
import { Narratives } from "./narratives";
import { CmoReadingWidget } from "./cmo-reading";
import { ActivityTicker } from "./activity-ticker";
import { StatCard } from "@/components/ui/stat-card";
import { subHours, subDays } from "date-fns";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type SortKey = "snt" | "age" | "sentiment" | "source";
type SearchParams = {
  source?: string;
  district?: string;
  status?: string;
  min_snt?: string;
  sort?: SortKey;
  dir?: "asc" | "desc";
  page?: string;
};

export default async function FirmInbox({ searchParams }: { searchParams: SearchParams }) {
  const supabase = createClient();

  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);
  const sort = (searchParams.sort ?? "snt") as SortKey;
  const dir = searchParams.dir ?? "desc";
  const ascending = dir === "asc";

  // Map sort key to actual Supabase column
  const sortColumn = sort === "age" ? "events(published_at)"
    : sort === "sentiment" ? "sentiment"
    : sort === "source" ? "events(source)"
    : "snt_score";

  let query = supabase
    .from("classifications")
    .select(`
      event_id,
      sentiment,
      snt_score,
      topic_tags,
      district_id,
      constituency_id,
      mla_id,
      classified_at,
      events!inner ( id, source, source_id, url, title, body, published_at, ingested_at ),
      districts ( id, name ),
      constituencies ( id, name )
    `, { count: "exact" })
    .order(sortColumn, { ascending, nullsFirst: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (searchParams.source) query = query.eq("events.source", searchParams.source);
  if (searchParams.district) query = query.eq("district_id", parseInt(searchParams.district, 10));
  if (searchParams.min_snt) query = query.gte("snt_score", parseFloat(searchParams.min_snt));

  const { data, error, count } = await query;
  if (error) {
    return <div className="container mx-auto px-6 py-10 text-sm text-severity-1">Inbox query failed: {error.message}</div>;
  }

  const eventIds = (data ?? []).map((r) => r.event_id);
  const triageByEvent = new Map<string, string>();
  const starredEvents = new Set<string>();
  if (eventIds.length > 0) {
    const { data: { user } } = await supabase.auth.getUser();
    const [triageRes, starRes] = await Promise.all([
      supabase.from("triage").select("event_id, status").in("event_id", eventIds),
      user ? supabase.from("event_stars").select("event_id").eq("user_id", user.id).in("event_id", eventIds) : Promise.resolve({ data: [] }),
    ]);
    for (const t of triageRes.data ?? []) triageByEvent.set(t.event_id, t.status);
    for (const s of starRes.data ?? []) starredEvents.add(s.event_id);
  }

  let rows = (data ?? []).map((r) => {
    const ev = (r.events as unknown) as { id: string; source: string; source_id: string; url: string | null; title: string; body: string | null; published_at: string | null; ingested_at: string };
    const district = (r.districts as unknown) as { id: number; name: string } | null;
    const constituency = (r.constituencies as unknown) as { id: number; name: string } | null;
    return {
      id: ev.id,
      source: ev.source,
      title: ev.title,
      body: ev.body,
      url: ev.url,
      published_at: ev.published_at,
      ingested_at: ev.ingested_at,
      sentiment: r.sentiment,
      snt_score: r.snt_score,
      topic_tags: r.topic_tags ?? [],
      district: district?.name ?? null,
      constituency: constituency?.name ?? null,
      triage_status: triageByEvent.get(ev.id) ?? "new",
      starred: starredEvents.has(ev.id),
    };
  });

  if (searchParams.status) rows = rows.filter((r) => r.triage_status === searchParams.status);

  const { data: districts } = await supabase.from("districts").select("id, name").order("name");
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Stat strip — quick health snapshot at the top of the inbox.
  const since24h = subHours(new Date(), 24).toISOString();
  const since7d = subDays(new Date(), 7).toISOString();
  const prev24h = subHours(new Date(), 48).toISOString();
  const [
    { count: today_signals },
    { count: prev_signals },
    { count: open_queue },
    { count: active_alerts },
    { count: stories_week },
  ] = await Promise.all([
    supabase.from("events").select("id", { count: "exact", head: true }).gte("ingested_at", since24h),
    supabase.from("events").select("id", { count: "exact", head: true }).gte("ingested_at", prev24h).lt("ingested_at", since24h),
    supabase.from("field_submissions").select("id", { count: "exact", head: true }).in("status", ["pending", "needs_human"]),
    supabase.from("alerts").select("id", { count: "exact", head: true }).is("resolved_at", null).in("severity", ["s1", "s2"]),
    supabase.from("stories").select("id", { count: "exact", head: true }).eq("status", "published").gte("published_at", since7d),
  ]);

  const signalsDelta = (today_signals ?? 0) - (prev_signals ?? 0);
  const signalsPct = (prev_signals ?? 0) > 0 ? Math.round((signalsDelta / (prev_signals ?? 1)) * 100) : null;

  return (
    <div className="container mx-auto max-w-7xl px-6 py-8">
      {/* Header row */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-bronze">Signal Inbox</div>
          <h1 className="mt-2 font-serif text-3xl font-bold text-navy">Today&apos;s signals</h1>
          <p className="mt-1 text-sm text-muted">Ranked by composite SNT score. Click a row to see full classification and triage actions.</p>
        </div>
      </div>

      {/* Stat strip — 4 quick-glance KPIs */}
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Signals · 24h"
          value={(today_signals ?? 0).toLocaleString()}
          delta={signalsPct != null ? {
            value: `${signalsDelta >= 0 ? "+" : ""}${signalsPct}%`,
            tone: signalsDelta >= 0 ? "positive" : "negative",
          } : undefined}
          hint={`vs ${(prev_signals ?? 0).toLocaleString()} the prior 24h`}
        />
        <StatCard
          label="Triage queue"
          value={(open_queue ?? 0).toString()}
          hint={open_queue && open_queue > 10 ? "Backlog growing" : "Healthy"}
          delta={open_queue && open_queue > 10 ? { value: "Action", tone: "negative" } : undefined}
        />
        <StatCard
          label="Active S1 / S2"
          value={(active_alerts ?? 0).toString()}
          hint={active_alerts && active_alerts > 0 ? "Unresolved" : "All clear"}
          delta={active_alerts && active_alerts > 0 ? { value: "Live", tone: "negative" } : { value: "Clear", tone: "positive" }}
        />
        <StatCard
          label="Stories · 7d"
          value={(stories_week ?? 0).toString()}
          hint="Published to outlets"
        />
      </div>

      <div className="mt-4">
        <ActivityTicker />
      </div>

      <div className="mt-6 space-y-6">
        <TodaysCall />
        <CmoReadingWidget />
        <Narratives />
      </div>

      <div className="mt-6">
        <InboxClient
          rows={rows}
          districts={districts ?? []}
          initial={searchParams}
          page={page}
          totalPages={totalPages}
          totalCount={total}
          sort={sort}
          dir={dir}
        />
      </div>
    </div>
  );
}
