import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SentimentTrend } from "@/components/sentiment-sparkline";
import { sentimentColor, sntBadge, shortSource } from "@/lib/format";
import { formatDistanceToNowStrict, subDays } from "date-fns";

export const dynamic = "force-dynamic";

export default async function DistrictPage({ params }: { params: { id: string } }) {
  const id = parseInt(params.id, 10);
  if (Number.isNaN(id)) notFound();
  const sb = createClient();

  const { data: district } = await sb
    .from("districts")
    .select("id, name, hq, tier, dominant_communities, population_est")
    .eq("id", id)
    .maybeSingle();
  if (!district) notFound();

  const since = subDays(new Date(), 30);
  const sinceDay = since.toISOString().slice(0, 10);
  const sinceISO = since.toISOString();

  const [constsRes, trendRes, eventsRes, voicesRes] = await Promise.all([
    sb.from("constituencies").select("id, name, number, current_mla_id, mlas!constituencies_mla_fk(name, party, is_minister)").eq("district_id", id).order("number"),
    sb.from("sentiment_snapshots").select("date, net_sentiment").eq("scope_type", "district").eq("scope_id", id).gte("date", sinceDay).order("date"),
    sb.from("classifications")
      .select("event_id, snt_score, sentiment, events!inner(id, title, source, published_at, url)")
      .eq("district_id", id).gte("classified_at", sinceISO).order("snt_score", { ascending: false, nullsFirst: false }).limit(10),
    sb.from("voices").select("id, name, role, ever_paid, ever_scripted").eq("district_id", id).eq("active", true).limit(8),
  ]);

  const trend = (trendRes.data ?? []).map((r) => ({ date: r.date, value: Number(r.net_sentiment) }));
  const todayValue = trend.length > 0 ? trend[trend.length - 1].value : 0;

  return (
    <div className="container mx-auto max-w-6xl px-6 py-10">
      <div className="text-xs uppercase tracking-[0.18em] text-bronze">District</div>
      <div className="mt-1 flex items-baseline gap-3">
        <h1 className="font-serif text-4xl font-bold text-navy">{district.name}</h1>
        {district.tier && <Badge variant={district.tier === 1 ? "bronze" : "outline"}>Tier {district.tier}</Badge>}
      </div>
      <p className="mt-1 text-sm text-muted">
        HQ: {district.hq ?? "—"}
        {district.dominant_communities && district.dominant_communities.length > 0 && (
          <> · {district.dominant_communities.join(", ")}</>
        )}
        {district.population_est && <> · ~{district.population_est.toLocaleString("en-IN")} people</>}
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>30-day sentiment</CardTitle>
            <CardDescription>
              Today: <span className="numeric-callout text-base text-navy">{todayValue >= 0 ? "+" : ""}{todayValue.toFixed(2)}</span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SentimentTrend series={trend} height={180} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Local voices</CardTitle>
            <CardDescription>{(voicesRes.data ?? []).length} active.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {(voicesRes.data ?? []).map((v) => (
              <div key={v.id} className="flex items-center justify-between border-b border-border pb-1.5 last:border-0">
                <div>
                  <div className="text-sm font-medium text-navy">{v.name}</div>
                  <div className="text-xs text-muted">{v.role ?? "—"}</div>
                </div>
                {v.ever_paid ? <Badge variant="negative">paid</Badge> : <Badge variant="positive">unpaid</Badge>}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Constituencies</CardTitle>
            <CardDescription>{(constsRes.data ?? []).length} in this district. Click for the seat-level view.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {(constsRes.data ?? []).map((c) => {
              const m = (c.mlas as unknown) as { name: string; party: string | null; is_minister: boolean } | null;
              return (
                <Link
                  key={c.id}
                  href={`/party/constituency/${c.id}`}
                  className="-mx-2 flex items-center justify-between rounded px-2 py-1.5 hover:bg-sand"
                >
                  <div>
                    <div className="text-sm font-medium text-navy">#{c.number} {c.name}</div>
                    {m && <div className="text-xs text-muted">{m.name} ({m.party}){m.is_minister ? " · Minister" : ""}</div>}
                  </div>
                  <span className="text-xs text-bronze">→</span>
                </Link>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent signals</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(eventsRes.data ?? []).length === 0 && <div className="text-sm text-muted">No recent signals.</div>}
            {(eventsRes.data ?? []).map((r) => {
              const ev = (r.events as unknown) as { id: string; title: string; source: string; published_at: string | null; url: string | null };
              const snt = sntBadge(r.snt_score ?? 0);
              return (
                <div key={r.event_id} className="flex gap-3 border-b border-border pb-3 last:border-0">
                  <Badge variant={snt.variant}>{snt.label}</Badge>
                  <div className="flex-1">
                    <div className="line-clamp-2 text-sm font-medium text-navy">
                      {ev.url ? <a href={ev.url} target="_blank" rel="noreferrer" className="hover:underline">{ev.title}</a> : ev.title}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                      <span>{shortSource(ev.source)}</span>
                      {ev.published_at && <span>· {formatDistanceToNowStrict(new Date(ev.published_at))} ago</span>}
                      <span className="ml-2 inline-block h-2 w-2 rounded-full" style={{ background: sentimentColor(r.sentiment) }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
