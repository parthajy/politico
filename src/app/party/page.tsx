import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ApHeatMap } from "@/components/ap-heat-map";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SentimentSparkline } from "@/components/sentiment-sparkline";
import { format, formatDistanceToNowStrict, subDays } from "date-fns";

export const dynamic = "force-dynamic";

async function loadDashboard() {
  const sb = createClient();
  const today = new Date();
  const since30 = subDays(today, 30).toISOString().slice(0, 10);

  // 1. State sentiment trend (30-day) for headline + sparkline
  const { data: stateTrend } = await sb
    .from("sentiment_snapshots")
    .select("date, net_sentiment, sample_size")
    .eq("scope_type", "state")
    .gte("date", since30)
    .order("date", { ascending: true });

  const trend = (stateTrend ?? []).map((r) => ({ date: r.date, value: Number(r.net_sentiment) }));
  const todayValue = trend.length > 0 ? trend[trend.length - 1].value : 0;
  const baseline = trend.length > 0 ? trend[0].value : 0;
  const delta = todayValue - baseline;

  // 2. District-level rollup for heat map
  const { data: districts } = await sb.from("districts").select("id, name");
  const sinceISO = subDays(today, 30).toISOString();
  const districtRows = await Promise.all(
    (districts ?? []).map(async (d) => {
      const [{ data: ds }, { count }] = await Promise.all([
        sb
          .from("sentiment_snapshots")
          .select("net_sentiment")
          .eq("scope_type", "district")
          .eq("scope_id", d.id)
          .gte("date", since30)
          .order("date", { ascending: false })
          .limit(1)
          .maybeSingle(),
        sb
          .from("classifications")
          .select("event_id", { count: "exact", head: true })
          .eq("district_id", d.id)
          .gte("classified_at", sinceISO),
      ]);
      return {
        id: d.id,
        name: d.name,
        net_sentiment: ds?.net_sentiment != null ? Number(ds.net_sentiment) : null,
        signals_30d: count ?? 0,
      };
    })
  );

  // 3. Top 5 active alerts
  const { data: alerts } = await sb
    .from("alerts")
    .select("id, severity, title, body, created_at, event_id")
    .is("resolved_at", null)
    .order("created_at", { ascending: false })
    .limit(5);

  // 4. Today's published brief preview (if any)
  const { data: brief } = await sb
    .from("briefs")
    .select("id, brief_date, body_md, published_at")
    .not("published_at", "is", null)
    .order("brief_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  // 5. Top stories (published this week)
  const lastWeek = subDays(today, 7).toISOString();
  const { data: stories } = await sb
    .from("stories")
    .select("id, title, outlet, url, reach_estimate, published_at, districts(name)")
    .eq("status", "published")
    .gte("published_at", lastWeek)
    .order("published_at", { ascending: false })
    .limit(5);

  return { trend, todayValue, delta, districtRows, alerts: alerts ?? [], brief, stories: stories ?? [] };
}

export default async function PartyHome() {
  const d = await loadDashboard();

  return (
    <div className="container mx-auto max-w-7xl px-6 py-10">
      <div className="text-xs uppercase tracking-[0.18em] text-bronze">State Dashboard</div>
      <h1 className="mt-2 font-serif text-4xl font-bold text-navy">Arunachal Pradesh — {format(new Date(), "EEEE, d MMMM")}</h1>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Sentiment heat map</CardTitle>
              <p className="text-xs text-muted">Last-snapshot net sentiment per district. Click a district to drill down.</p>
            </CardHeader>
            <CardContent>
              <ApHeatMap data={d.districtRows} />
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Today&apos;s sentiment</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="numeric-callout text-5xl text-navy">
                {d.todayValue >= 0 ? "+" : ""}{d.todayValue.toFixed(2)}
              </div>
              <div className="mt-1 text-xs text-muted">
                Δ 30 days: <span className={d.delta >= 0 ? "text-positive" : "text-severity-1"}>
                  {d.delta >= 0 ? "+" : ""}{d.delta.toFixed(2)}
                </span>
              </div>
              <div className="mt-4">
                <SentimentSparkline series={d.trend} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Active alerts</CardTitle>
                <Link href="/party/alerts" className="text-xs text-bronze underline">View all</Link>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {d.alerts.length === 0 && <div className="text-xs text-muted">No active alerts.</div>}
              {d.alerts.map((a) => (
                <div key={a.id} className="flex gap-2 border-l-2 border-border pl-3" style={{ borderColor: a.severity === "s1" ? "var(--severity-1)" : "var(--bronze)" }}>
                  <Badge variant={a.severity === "s1" ? "s1" : "s2"}>{a.severity.toUpperCase()}</Badge>
                  <div className="flex-1">
                    <div className="line-clamp-2 text-sm font-medium text-navy">{a.title}</div>
                    <div className="text-[10px] text-muted">{formatDistanceToNowStrict(new Date(a.created_at))} ago</div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Today&apos;s brief</CardTitle>
                <Link href="/party/brief" className="text-xs text-bronze underline">Open full brief</Link>
              </div>
            </CardHeader>
            <CardContent>
              {!d.brief && <div className="text-sm text-muted">No published brief yet for today.</div>}
              {d.brief && (
                <div>
                  <div className="text-xs text-muted">{format(new Date(d.brief.brief_date), "EEEE, d MMMM")}</div>
                  <div className="prose prose-sm mt-2 max-w-none text-foreground">
                    {(d.brief.body_md ?? "").split("\n").slice(0, 6).map((line: string, i: number) => (
                      <p key={i} className="my-1.5 text-sm leading-relaxed">{line}</p>
                    ))}
                  </div>
                  <Link href="/party/brief" className="mt-3 inline-block text-xs text-bronze underline">Continue reading…</Link>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>This week&apos;s stories</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {d.stories.length === 0 && <div className="text-xs text-muted">No stories published this week yet.</div>}
            {d.stories.map((s) => {
              const dist = (s.districts as unknown) as { name: string } | null;
              return (
                <div key={s.id} className="border-b border-border pb-2 last:border-0">
                  <div className="line-clamp-2 text-sm font-medium text-navy">{s.title}</div>
                  <div className="mt-0.5 text-xs text-muted">
                    {s.outlet ?? "(outlet pending)"}{dist ? ` · ${dist.name}` : ""}{s.reach_estimate ? ` · ${(s.reach_estimate / 1000).toFixed(0)}k reach` : ""}
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
