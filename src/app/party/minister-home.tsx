import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SentimentSparkline } from "@/components/sentiment-sparkline";
import { ThreatCardLink } from "@/components/threat-card-link";
import { format, formatDistanceToNowStrict, subDays } from "date-fns";

// Per-minister "My desk" — the only thing they can see. Everything is keyed
// off (mla_id, constituency_id, district_id). They never see other ministers,
// nor state-wide aggregates.

export type MinisterScope = {
  mla_id: number;
  mla_name: string;
  is_cm: boolean;
  is_deputy_cm: boolean;
  portfolio: string | null;
  constituency_id: number | null;
  constituency_name: string | null;
  district_id: number | null;
  district_name: string | null;
};

export default async function MinisterHome({ scope }: { scope: MinisterScope }) {
  const sb = createClient();
  const today = new Date();
  const sinceDay = subDays(today, 30).toISOString().slice(0, 10);
  const sinceISO = subDays(today, 30).toISOString();

  // 30-day sentiment trend for this minister (fall back to district if empty)
  let { data: trendRaw } = await sb
    .from("sentiment_snapshots")
    .select("date, net_sentiment")
    .eq("scope_type", "minister")
    .eq("scope_id", scope.mla_id)
    .gte("date", sinceDay)
    .order("date");
  if ((trendRaw ?? []).length === 0 && scope.district_id) {
    const { data: dt } = await sb
      .from("sentiment_snapshots")
      .select("date, net_sentiment")
      .eq("scope_type", "district")
      .eq("scope_id", scope.district_id)
      .gte("date", sinceDay)
      .order("date");
    trendRaw = dt;
  }
  const trend = (trendRaw ?? []).map((r) => ({ date: r.date, value: Number(r.net_sentiment) }));
  const todayValue = trend.length > 0 ? trend[trend.length - 1].value : 0;
  const baseline = trend.length > 0 ? trend[0].value : 0;
  const delta = todayValue - baseline;

  // Scope filter for the classifications table: signals tagged to THIS minister
  // OR to their constituency (so locally-rooted noise about their seat shows up).
  const scopeFilter = `mla_id.eq.${scope.mla_id}${scope.constituency_id ? `,constituency_id.eq.${scope.constituency_id}` : ""}`;

  const [{ count: total }, { count: negCount }, { data: topSignals }, scopedEventIds] = await Promise.all([
    sb.from("classifications")
      .select("event_id", { count: "exact", head: true })
      .or(scopeFilter)
      .gte("classified_at", sinceISO),
    sb.from("classifications")
      .select("event_id", { count: "exact", head: true })
      .or(scopeFilter)
      .gte("classified_at", sinceISO)
      .lt("sentiment", -0.15),
    sb.from("classifications")
      .select("event_id, snt_score, sentiment, topic_tags, events!inner(title, source, published_at, url)")
      .or(scopeFilter)
      .gte("classified_at", sinceISO)
      .order("snt_score", { ascending: false, nullsFirst: false })
      .limit(8),
    // Need event_ids tagged to me to scope alerts (alerts table has no mla/constituency fields)
    sb.from("classifications")
      .select("event_id")
      .or(scopeFilter)
      .gte("classified_at", sinceISO)
      .limit(2000),
  ]);

  const myEventIds = new Set((scopedEventIds.data ?? []).map((r) => r.event_id));
  const { data: alerts } = myEventIds.size > 0
    ? await sb.from("alerts")
        .select("id, severity, title, body, created_at")
        .in("event_id", Array.from(myEventIds))
        .is("resolved_at", null)
        .order("created_at", { ascending: false })
        .limit(5)
    : { data: [] as { id: string; severity: string; title: string; body: string | null; created_at: string }[] };

  const t = total ?? 0;
  const neg = negCount ?? 0;
  const negShare = t > 0 ? neg / t : 0;
  const riskComposite = t === 0 ? 0 : Math.min(1, negShare * 0.7 + Math.min(1, t / 30) * 0.3);
  const riskBand = riskComposite >= 0.6 ? "high" : riskComposite >= 0.3 ? "medium" : "low";

  // Threat summary for this minister (or CM if scope flag set)
  const { data: ttRow } = scope.is_cm
    ? await sb.from("threat_assessments_summary").select("threat_band, headline, public_posture, generated_at").eq("scope_type", "cm").maybeSingle()
    : await sb.from("threat_assessments_summary").select("threat_band, headline, public_posture, generated_at").eq("scope_type", "minister").eq("scope_id", scope.mla_id).maybeSingle();

  // Topic clustering
  const tagCount = new Map<string, number>();
  for (const r of topSignals ?? []) {
    for (const tag of (r.topic_tags ?? []) as string[]) tagCount.set(tag, (tagCount.get(tag) ?? 0) + 1);
  }
  const topTopics = Array.from(tagCount.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <div className="container mx-auto max-w-6xl px-6 py-10">
      <div className="text-xs uppercase tracking-[0.18em] text-bronze">
        {scope.is_cm ? "Chief Minister" : scope.is_deputy_cm ? "Deputy Chief Minister" : "Minister"} · personal desk
      </div>
      <h1 className="mt-2 font-serif text-3xl font-bold text-navy">{scope.mla_name}</h1>
      <p className="mt-1 text-sm text-muted">
        {scope.portfolio ?? "Portfolio unassigned"}
        {scope.constituency_name && <span> · {scope.constituency_name} ({scope.district_name})</span>}
        <span> · {format(today, "EEEE, d MMMM")}</span>
      </p>

      {/* Hero stats */}
      <div className="mt-6 grid gap-3 md:grid-cols-4">
        <Stat label="Footprint (30d)" value={t.toString()} hint="signals tagged to you or your seat" />
        <Stat label="Negative" value={neg.toString()} hint="critical or hostile" highlight={neg > 0 ? "warn" : null} />
        <Stat label="Negative share" value={t > 0 ? `${Math.round(negShare * 100)}%` : "—"} hint="of all your signals" />
        <Stat label="Risk band" value={riskBand.toUpperCase()} hint="composite assessment" highlight={riskBand === "high" ? "warn" : null} />
      </div>

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-3">
        {/* Threat */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Threat radar — {scope.is_cm ? "you (CM)" : "your portfolio"}</CardTitle>
            </CardHeader>
            <CardContent>
              {!ttRow ? (
                <div className="rounded border border-dashed border-border p-4 text-xs text-muted">
                  No threat assessment yet. The analyst desk generates one daily — when ready, the headline + public posture appear here.
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-[10px] uppercase tracking-wider text-muted">Headline</div>
                    <Badge variant={ttRow.threat_band === "critical" || ttRow.threat_band === "high" ? "s1" : ttRow.threat_band === "medium" ? "s2" : "s3"}>
                      {ttRow.threat_band.toUpperCase()}
                    </Badge>
                  </div>
                  <p className="text-sm text-navy">{ttRow.headline}</p>
                  {ttRow.public_posture && (
                    <div className="rounded border-l-2 border-bronze bg-sand-deep/40 p-3">
                      <div className="text-[10px] uppercase tracking-wider text-bronze">If a journalist asks today</div>
                      <p className="mt-1 text-sm italic text-foreground/85">&ldquo;{ttRow.public_posture}&rdquo;</p>
                    </div>
                  )}
                  <div>
                    <ThreatCardLink scope_type={scope.is_cm ? "cm" : "minister"} scope_id={scope.is_cm ? null : scope.mla_id} />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Top signals */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Top signals about you (30d)</CardTitle>
              <p className="text-xs text-muted">Ranked by SNT score — the analyst&apos;s composite priority.</p>
            </CardHeader>
            <CardContent>
              {(topSignals ?? []).length === 0 ? (
                <div className="text-xs text-muted">Quiet patch. No tagged signals in the last 30 days.</div>
              ) : (
                <ul className="space-y-3">
                  {(topSignals ?? []).map((r) => {
                    const ev = (r.events as unknown) as { title: string; source: string; published_at: string | null; url: string | null };
                    const sntBand = (r.snt_score ?? 0) >= 0.85 ? "s1" : (r.snt_score ?? 0) >= 0.6 ? "s2" : "s3";
                    return (
                      <li key={r.event_id} className="border-b border-border pb-2 last:border-0">
                        <div className="flex items-start gap-2">
                          <Badge variant={sntBand}>SNT {(r.snt_score ?? 0).toFixed(2)}</Badge>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-navy">
                              {ev.url ? <a href={ev.url} target="_blank" rel="noreferrer" className="hover:underline">{ev.title}</a> : ev.title}
                            </div>
                            <div className="mt-0.5 text-[11px] text-muted">
                              {ev.source}
                              {ev.published_at && <> · {formatDistanceToNowStrict(new Date(ev.published_at))} ago</>}
                              <> · sentiment {(r.sentiment ?? 0).toFixed(2)}</>
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>30-day sentiment</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="numeric-callout text-4xl text-navy">
                {todayValue >= 0 ? "+" : ""}{todayValue.toFixed(2)}
              </div>
              <div className="mt-1 text-xs text-muted">
                vs 30 days ago: <span className={delta >= 0 ? "text-positive" : "text-severity-1"}>
                  {delta >= 0 ? "+" : ""}{delta.toFixed(2)}
                </span>
              </div>
              <div className="mt-4">
                <SentimentSparkline series={trend} />
              </div>
            </CardContent>
          </Card>

          {topTopics.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Topics forming around you</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {topTopics.map(([t, c]) => (
                  <div key={t} className="flex items-center justify-between text-sm">
                    <Link href={`/party/entity/topic/${encodeURIComponent(t)}`} className="text-navy hover:text-bronze hover:underline">{t}</Link>
                    <span className="tabular-nums text-muted">{c}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {scope.constituency_id && (
            <Card>
              <CardHeader>
                <CardTitle>Your constituency</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm font-medium text-navy">{scope.constituency_name}</div>
                <div className="text-xs text-muted">{scope.district_name}</div>
                <Link href={`/party/constituency/${scope.constituency_id}`} className="mt-3 inline-block text-xs text-bronze underline">
                  Open seat detail →
                </Link>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Your alerts</CardTitle>
                <Link href="/party/alerts" className="text-xs text-bronze underline">View all</Link>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {(alerts ?? []).length === 0 && <div className="text-xs text-muted">No active alerts for your portfolio.</div>}
              {(alerts ?? []).map((a) => (
                <div key={a.id} className="border-l-2 pl-3" style={{ borderColor: a.severity === "s1" ? "var(--severity-1)" : "var(--bronze)" }}>
                  <Badge variant={a.severity === "s1" ? "s1" : "s2"}>{a.severity.toUpperCase()}</Badge>
                  <div className="mt-1 line-clamp-2 text-sm font-medium text-navy">{a.title}</div>
                  <div className="text-[10px] text-muted">{formatDistanceToNowStrict(new Date(a.created_at))} ago</div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, hint, highlight }: { label: string; value: string; hint?: string; highlight?: "warn" | null }) {
  return (
    <div className={`rounded-lg border bg-white p-4 ${highlight === "warn" ? "border-severity-1/40" : "border-border"}`}>
      <div className="text-[10px] uppercase tracking-wider text-muted">{label}</div>
      <div className={`numeric-callout text-3xl ${highlight === "warn" ? "text-severity-1" : "text-navy"}`}>{value}</div>
      {hint && <div className="mt-1 text-[10px] text-muted">{hint}</div>}
    </div>
  );
}
