import { createClient } from "@/lib/supabase/server";
import { InboxClient } from "./inbox-client";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type SearchParams = { source?: string; district?: string; status?: string; min_snt?: string };

export default async function FirmInbox({ searchParams }: { searchParams: SearchParams }) {
  const supabase = createClient();

  // Build the query — flat join via Supabase's foreign-key sugar.
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
      constituencies ( id, name ),
      triage ( status, assigned_to, updated_at )
    `)
    .order("snt_score", { ascending: false, nullsFirst: false })
    .limit(PAGE_SIZE);

  if (searchParams.source) query = query.eq("events.source", searchParams.source);
  if (searchParams.district) query = query.eq("district_id", parseInt(searchParams.district, 10));
  if (searchParams.min_snt) query = query.gte("snt_score", parseFloat(searchParams.min_snt));

  const { data, error } = await query;
  if (error) {
    return <div className="container mx-auto px-6 py-10 text-sm text-severity-1">Inbox query failed: {error.message}</div>;
  }

  let rows = (data ?? []).map((r) => {
    const ev = (r.events as unknown) as { id: string; source: string; source_id: string; url: string | null; title: string; body: string | null; published_at: string | null; ingested_at: string };
    const district = (r.districts as unknown) as { id: number; name: string } | null;
    const constituency = (r.constituencies as unknown) as { id: number; name: string } | null;
    const triage = ((r.triage as unknown) as { status: string; assigned_to: string | null; updated_at: string }[] | { status: string } | null);
    const triageStatus = Array.isArray(triage) ? triage[0]?.status : (triage?.status ?? "new");
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
      triage_status: triageStatus ?? "new",
    };
  });

  if (searchParams.status) rows = rows.filter((r) => r.triage_status === searchParams.status);

  // Filter dropdowns: pull district list (cached implicitly by Next).
  const { data: districts } = await supabase.from("districts").select("id, name").order("name");

  return (
    <div className="container mx-auto max-w-7xl px-6 py-10">
      <div className="text-xs uppercase tracking-[0.18em] text-bronze">Signal Inbox</div>
      <h1 className="mt-2 font-serif text-3xl font-bold text-navy">Today&apos;s signals</h1>
      <p className="mt-1 text-sm text-muted">Ranked by composite SNT score. Click a row to see full classification and triage actions.</p>
      <InboxClient rows={rows} districts={districts ?? []} initial={searchParams} />
    </div>
  );
}
