import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SentimentSparkline } from "@/components/sentiment-sparkline";
import { ThreatCardLink } from "@/components/threat-card-link";
import { subDays } from "date-fns";

export const dynamic = "force-dynamic";

export default async function CabinetGrid() {
  const sb = createClient();
  const { data: ministers } = await sb
    .from("mlas")
    .select("id, name, party, portfolio, is_cm, is_deputy_cm, constituency_id, constituencies!mlas_constituency_id_fkey(name, district_id)")
    .eq("is_minister", true)
    .order("is_cm", { ascending: false })
    .order("is_deputy_cm", { ascending: false })
    .order("name");

  const sinceDay = subDays(new Date(), 30).toISOString().slice(0, 10);
  const sinceISO = subDays(new Date(), 30).toISOString();

  // Pull all minister threat summaries (CMO read-allowed via summary view)
  const ministerIds = (ministers ?? []).map((m) => m.id);
  const { data: threatSummaries } = ministerIds.length > 0
    ? await sb.from("threat_assessments_summary").select("scope_id, threat_band, headline, generated_at").eq("scope_type", "minister").in("scope_id", ministerIds)
    : { data: [] as { scope_id: number | null; threat_band: string; headline: string; generated_at: string }[] };
  const threatByMla = new Map<number, { threat_band: string; headline: string; generated_at: string }>();
  for (const t of threatSummaries ?? []) {
    if (t.scope_id != null) threatByMla.set(t.scope_id, { threat_band: t.threat_band, headline: t.headline, generated_at: t.generated_at });
  }
  // Also pick up the CM threat for the CM card if present
  const { data: cmThreat } = await sb.from("threat_assessments_summary").select("threat_band, headline, generated_at").eq("scope_type", "cm").maybeSingle();

  const enriched = await Promise.all(
    (ministers ?? []).map(async (m) => {
      const constJoin = (m.constituencies as unknown) as { name: string; district_id: number | null } | null;

      const [{ data: trend }, { count: footprint }, { data: recentSignals }, { count: negCount }] = await Promise.all([
        sb
          .from("sentiment_snapshots")
          .select("date, net_sentiment")
          .eq("scope_type", "minister")
          .eq("scope_id", m.id)
          .gte("date", sinceDay)
          .order("date"),
        sb
          .from("classifications")
          .select("event_id", { count: "exact", head: true })
          .eq("mla_id", m.id)
          .gte("classified_at", sinceISO),
        sb
          .from("classifications")
          .select("snt_score, sentiment, topic_tags, events!inner(title)")
          .eq("mla_id", m.id)
          .gte("classified_at", sinceISO)
          .order("snt_score", { ascending: false, nullsFirst: false })
          .limit(3),
        sb
          .from("classifications")
          .select("event_id", { count: "exact", head: true })
          .eq("mla_id", m.id)
          .gte("classified_at", sinceISO)
          .lt("sentiment", -0.15),
      ]);

      // Fall back to district trend if minister-level is empty
      let series = (trend ?? []).map((r) => ({ date: r.date, value: Number(r.net_sentiment) }));
      if (series.length === 0 && constJoin?.district_id) {
        const { data: dt } = await sb
          .from("sentiment_snapshots")
          .select("date, net_sentiment")
          .eq("scope_type", "district")
          .eq("scope_id", constJoin.district_id)
          .gte("date", sinceDay)
          .order("date");
        series = (dt ?? []).map((r) => ({ date: r.date, value: Number(r.net_sentiment) }));
      }

      // Risk score: blend of negative-signal share and absolute volume.
      const total = footprint ?? 0;
      const neg = negCount ?? 0;
      const negShare = total > 0 ? neg / total : 0;
      const risk = total === 0 ? 0 : Math.min(1, negShare * 0.7 + Math.min(1, total / 30) * 0.3);
      const riskBand = risk >= 0.6 ? "high" : risk >= 0.3 ? "medium" : "low";

      // Topic clustering for narrative line
      const tagCount = new Map<string, number>();
      for (const r of recentSignals ?? []) {
        for (const t of (r.topic_tags ?? []) as string[]) tagCount.set(t, (tagCount.get(t) ?? 0) + 1);
      }
      const topTopics = Array.from(tagCount.entries()).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([t]) => t);

      // Threat summary for this minister (CM threat handled separately on the card)
      const tt = m.is_cm ? cmThreat : threatByMla.get(m.id);

      return {
        ...m,
        constituency_name: constJoin?.name ?? null,
        trend: series,
        footprint: total,
        neg_count: neg,
        risk,
        risk_band: riskBand as "low" | "medium" | "high",
        top_topics: topTopics,
        top_signals: (recentSignals ?? []).map((r) => {
          const ev = (r.events as unknown) as { title: string };
          return { title: ev.title, sentiment: r.sentiment, snt_score: r.snt_score };
        }),
        threat_band: tt?.threat_band as "low" | "medium" | "high" | "critical" | undefined,
        threat_headline: tt?.headline ?? null,
      };
    })
  );

  const cm = enriched.filter((e) => e.is_cm);
  const dy = enriched.filter((e) => e.is_deputy_cm);
  const others = enriched.filter((e) => !e.is_cm && !e.is_deputy_cm);

  return (
    <div className="container mx-auto max-w-7xl px-6 py-10">
      <div className="text-xs uppercase tracking-[0.18em] text-bronze">Cabinet</div>
      <h1 className="mt-2 font-serif text-3xl font-bold text-navy">Council of Ministers</h1>
      <p className="mt-1 text-sm text-muted">Active footprint and 30-day sentiment trend per minister.</p>

      {[
        { title: "Chief Minister", set: cm },
        { title: "Deputy Chief Minister", set: dy },
        { title: "Cabinet Ministers", set: others },
      ].map(({ title, set }) =>
        set.length === 0 ? null : (
          <section key={title} className="mt-8">
            <h2 className="mb-3 font-serif text-lg font-bold text-navy">{title}</h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {set.map((m) => (
                <Card key={m.id} className={m.risk_band === "high" ? "border-l-4 border-l-severity-1" : m.risk_band === "medium" ? "border-l-4 border-l-bronze" : ""}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <Link href={`/party/entity/person/${m.id}`} className="block font-serif text-lg font-bold text-navy hover:underline">{m.name}</Link>
                        <div className="mt-1 text-xs text-muted">
                          {m.constituency_name ?? "Constituency unverified"}
                          {m.party && <span> · {m.party}</span>}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {m.is_cm && <Badge variant="bronze">CM</Badge>}
                        {m.is_deputy_cm && <Badge variant="bronze">Dy CM</Badge>}
                        <Badge variant={m.risk_band === "high" ? "s1" : m.risk_band === "medium" ? "s2" : "s3"}>
                          {m.risk_band === "high" ? "Risk · High" : m.risk_band === "medium" ? "Risk · Med" : "Risk · Low"}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {m.portfolio && (
                      <p className="line-clamp-2 text-xs text-foreground/80">{m.portfolio}</p>
                    )}
                    <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-muted">Footprint</div>
                        <div className="numeric-callout text-lg text-navy">{m.footprint}</div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-muted">Negative</div>
                        <div className={`numeric-callout text-lg ${m.neg_count > 0 ? "text-severity-1" : "text-navy"}`}>{m.neg_count}</div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-muted">Trend</div>
                        <SentimentSparkline series={m.trend} height={32} />
                      </div>
                    </div>
                    {m.top_topics.length > 0 && (
                      <div className="mt-3">
                        <div className="text-[10px] uppercase tracking-wider text-muted">Forming narrative</div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {m.top_topics.map((t) => (
                            <span key={t} className="rounded bg-sand-deep px-1.5 py-0.5 text-[10px] text-navy">{t}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {m.threat_headline && m.threat_band && (
                      <div className="mt-3 rounded border-l-2 bg-sand-deep/40 p-2"
                           style={{ borderLeftColor: m.threat_band === "critical" || m.threat_band === "high" ? "var(--severity-1)" : m.threat_band === "medium" ? "var(--bronze)" : "var(--muted)" }}>
                        <div className="flex items-center justify-between">
                          <div className="text-[10px] uppercase tracking-wider text-muted">Threat radar</div>
                          <Badge variant={m.threat_band === "critical" || m.threat_band === "high" ? "s1" : m.threat_band === "medium" ? "s2" : "s3"}>
                            {m.threat_band.toUpperCase()}
                          </Badge>
                        </div>
                        <p className="mt-1 text-[11px] text-foreground/85">{m.threat_headline}</p>
                        <div className="mt-1.5">
                          <ThreatCardLink scope_type={m.is_cm ? "cm" : "minister"} scope_id={m.is_cm ? null : m.id} />
                        </div>
                      </div>
                    )}
                    {m.top_signals.length > 0 && (
                      <div className="mt-3 border-t border-border pt-2">
                        <div className="text-[10px] uppercase tracking-wider text-muted">Top signal</div>
                        <p className="mt-0.5 line-clamp-2 text-[11px] text-foreground/85">{m.top_signals[0].title}</p>
                      </div>
                    )}
                    {m.constituency_id && (
                      <Link
                        href={`/party/constituency/${m.constituency_id}`}
                        className="mt-3 inline-block text-xs text-bronze underline"
                      >
                        Open seat →
                      </Link>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )
      )}
    </div>
  );
}
