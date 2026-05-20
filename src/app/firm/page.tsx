import { createClient } from "@/lib/supabase/server";
import { InboxClient } from "./inbox-client";
import { TodaysCall } from "./todays-call";
import { Narratives } from "./narratives";
import { CmoReadingWidget } from "./cmo-reading";

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

  return (
    <div className="container mx-auto max-w-7xl px-6 py-10">
      <div className="text-xs uppercase tracking-[0.18em] text-bronze">Signal Inbox</div>
      <h1 className="mt-2 font-serif text-3xl font-bold text-navy">Today&apos;s signals</h1>
      <p className="mt-1 text-sm text-muted">Ranked by composite SNT score. Click a row to see full classification and triage actions.</p>
      <TodaysCall />
      <CmoReadingWidget />
      <Narratives />
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
  );
}
