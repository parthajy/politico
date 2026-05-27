import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { InfoTooltip } from "@/components/info-tooltip";
import { sentimentColor } from "@/lib/format";
import { subDays } from "date-fns";
import { requireSession, isMinisterScope } from "@/lib/auth";

export const dynamic = "force-dynamic";

type SP = { sort?: "risk" | "name" | "district"; risk?: "all" | "high" | "medium" | "low" };

export default async function ConstituenciesOverview({ searchParams }: { searchParams: SP }) {
  const ctx = await requireSession();
  if (isMinisterScope(ctx)) {
    // Minister sees only their own seat — bounce them straight to it.
    if (ctx.scope.constituency_id) redirect(`/party/constituency/${ctx.scope.constituency_id}`);
    redirect("/party");
  }

  const sb = createClient();
  const since = subDays(new Date(), 30).toISOString();
  const sinceDay = subDays(new Date(), 30).toISOString().slice(0, 10);

  const { data: constituencies } = await sb
    .from("constituencies")
    .select("id, number, name, district_id, current_mla_id, mlas!constituencies_mla_fk(id, name, party, is_minister, is_cm, is_deputy_cm), districts(name)")
    .order("number");

  // Pull threat-radar summaries for any constituency that has one
  const { data: threatRows } = await sb
    .from("threat_assessments_summary")
    .select("scope_id, threat_band, headline")
    .eq("scope_type", "constituency");
  const threatByConst = new Map<number, { threat_band: string; headline: string }>();
  for (const t of threatRows ?? []) {
    if (t.scope_id != null) threatByConst.set(t.scope_id, { threat_band: t.threat_band, headline: t.headline });
  }

  // Batch all per-constituency aggregations into 4 queries (was 240 before).
  // - One query for all classifications in window, then bucket by constituency_id
  // - One query for all sentiment_snapshots in window
  const constituencyIds = (constituencies ?? []).map((c) => c.id);

  const [allClsRes, allSnapsRes] = await Promise.all([
    sb.from("classifications")
      .select("constituency_id, snt_score, sentiment, topic_tags, events!inner(title)")
      .in("constituency_id", constituencyIds)
      .gte("classified_at", since),
    sb.from("sentiment_snapshots")
      .select("scope_id, date, net_sentiment")
      .eq("scope_type", "constituency")
      .in("scope_id", constituencyIds)
      .gte("date", sinceDay)
      .order("date", { ascending: false }),
  ]);

  // Bucket classifications by constituency
  type ClsRow = { snt_score: number | null; sentiment: number | null; topic_tags: string[] | null; events: { title: string } | null };
  const clsByConst = new Map<number, ClsRow[]>();
  for (const r of (allClsRes.data ?? []) as unknown as (ClsRow & { constituency_id: number })[]) {
    if (r.constituency_id == null) continue;
    const list = clsByConst.get(r.constituency_id) ?? [];
    list.push(r);
    clsByConst.set(r.constituency_id, list);
  }
  // Pick the most recent snapshot per constituency
  const snapByConst = new Map<number, number>();
  for (const r of (allSnapsRes.data ?? [])) {
    if (r.scope_id == null) continue;
    if (!snapByConst.has(r.scope_id)) snapByConst.set(r.scope_id, Number(r.net_sentiment));
  }

  const enriched = (constituencies ?? []).map((c) => {
    const m = (c.mlas as unknown) as { id: number; name: string; party: string | null; is_minister: boolean; is_cm: boolean; is_deputy_cm: boolean } | null;
    const d = (c.districts as unknown) as { name: string } | null;

    const cls = clsByConst.get(c.id) ?? [];
    const t = cls.length;
    const n = cls.filter((r) => (r.sentiment ?? 0) < -0.15).length;
    // Top signal = highest SNT score
    const top = cls.slice().sort((a, b) => (b.snt_score ?? 0) - (a.snt_score ?? 0))[0];

    const negShare = t > 0 ? n / t : 0;
    const risk = t === 0 ? 0 : Math.min(1, negShare * 0.7 + Math.min(1, t / 20) * 0.3);
    const riskBand = risk >= 0.6 ? "high" : risk >= 0.3 ? "medium" : "low";
    const tt = threatByConst.get(c.id);

    return {
      id: c.id, number: c.number, name: c.name,
      district: d?.name ?? null,
      mla: m,
      footprint: t,
      neg_count: n,
      risk,
      risk_band: riskBand as "low" | "medium" | "high",
      top_signal_title: top?.events?.title ?? null,
      top_signal_tags: (top?.topic_tags ?? []) as string[],
      net_sentiment: snapByConst.get(c.id) ?? null,
      threat_band: tt?.threat_band as "low" | "medium" | "high" | "critical" | undefined,
      threat_headline: tt?.headline ?? null,
    };
  });

  // Filter + sort
  let filtered = enriched;
  if (searchParams.risk === "high") filtered = filtered.filter((r) => r.risk_band === "high");
  else if (searchParams.risk === "medium") filtered = filtered.filter((r) => r.risk_band === "medium");
  else if (searchParams.risk === "low") filtered = filtered.filter((r) => r.risk_band === "low");

  const sortKey = searchParams.sort ?? "risk";
  if (sortKey === "risk") filtered.sort((a, b) => b.risk - a.risk);
  else if (sortKey === "name") filtered.sort((a, b) => a.name.localeCompare(b.name));
  else if (sortKey === "district") filtered.sort((a, b) => (a.district ?? "").localeCompare(b.district ?? ""));

  const counts = {
    high: enriched.filter((r) => r.risk_band === "high").length,
    medium: enriched.filter((r) => r.risk_band === "medium").length,
    low: enriched.filter((r) => r.risk_band === "low").length,
  };

  return (
    <div className="container mx-auto max-w-7xl px-6 py-10">
      <div className="text-xs uppercase tracking-[0.18em] text-bronze">Constituencies</div>
      <h1 className="mt-2 font-serif text-3xl font-bold text-navy">All 60 seats — risk view</h1>
      <p className="mt-1 text-sm text-muted">Composite risk per seat over the last 30 days. Click a seat to drill down.</p>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <RiskTile band="high" count={counts.high} description="Negative narrative dominant or volume spiking." />
        <RiskTile band="medium" count={counts.medium} description="Watchable. Some hostile coverage, manageable volume." />
        <RiskTile band="low" count={counts.low} description="Quiet or net-positive coverage." />
      </div>

      <Card className="mt-6">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Seats</CardTitle>
              <CardDescription>{filtered.length} of {enriched.length} matching filters.</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-1 text-xs">
              <span className="text-muted">Filter:</span>
              {(["all", "high", "medium", "low"] as const).map((r) => {
                const active = (searchParams.risk ?? "all") === r;
                const params = new URLSearchParams();
                if (r !== "all") params.set("risk", r);
                if (searchParams.sort) params.set("sort", searchParams.sort);
                return (
                  <Link key={r} href={`?${params}`} className={`rounded px-2 py-1 ${active ? "bg-navy text-white" : "border border-border bg-white text-muted hover:bg-sand"}`}>
                    {r.charAt(0).toUpperCase() + r.slice(1)}
                  </Link>
                );
              })}
              <span className="ml-3 text-muted">Sort:</span>
              {(["risk", "name", "district"] as const).map((s) => {
                const active = (searchParams.sort ?? "risk") === s;
                const params = new URLSearchParams();
                params.set("sort", s);
                if (searchParams.risk) params.set("risk", searchParams.risk);
                return (
                  <Link key={s} href={`?${params}`} className={`rounded px-2 py-1 ${active ? "bg-navy text-white" : "border border-border bg-white text-muted hover:bg-sand"}`}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </Link>
                );
              })}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-sand text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="w-10 px-3 py-2 text-left">#</th>
                <th className="px-3 py-2 text-left">Seat</th>
                <th className="px-3 py-2 text-left">MLA</th>
                <th className="w-24 px-3 py-2 text-left">Risk<InfoTooltip text="Backward-looking risk band from the last 30 days. Composite of negative-coverage share and signal volume." /></th>
                <th className="w-24 px-3 py-2 text-left">Threat radar<InfoTooltip text="Forward-looking threat band for the next 24h / 7d / 30d. Updated by the analyst desk on demand. Hover to see the headline." /></th>
                <th className="w-20 px-3 py-2 text-left">Vol / Neg<InfoTooltip text="Signal volume in last 30 days · count of those that are negative-sentiment (< −0.15)." /></th>
                <th className="w-20 px-3 py-2 text-left">Sent<InfoTooltip text="Most recent net sentiment snapshot for this seat. −1.0 hostile, 0 neutral, +1.0 supportive." /></th>
                <th className="px-3 py-2 text-left">Forming narrative<InfoTooltip text="Top recent high-SNT signal headline + dominant topic tag for this seat." /></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0 hover:bg-sand/40">
                  <td className="px-3 py-2 text-xs text-muted">{r.number}</td>
                  <td className="px-3 py-2">
                    <Link href={`/party/entity/constituency/${r.id}`} className="font-medium text-navy hover:underline" title="Open memory vault for this seat">{r.name}</Link>
                    <div className="text-xs text-muted">{r.district ?? "—"}</div>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {r.mla?.id ? (
                      <Link href={`/party/entity/person/${r.mla.id}`} className="hover:underline" title="Open memory vault for this MLA">{r.mla.name}</Link>
                    ) : (r.mla?.name ?? "—")}
                    {r.mla?.party && <span className="text-muted"> · {r.mla.party}</span>}
                    {r.mla?.is_cm && <Badge variant="bronze" className="ml-1">CM</Badge>}
                    {r.mla?.is_deputy_cm && <Badge variant="bronze" className="ml-1">Dy CM</Badge>}
                    {r.mla?.is_minister && !r.mla.is_cm && !r.mla.is_deputy_cm && <Badge variant="default" className="ml-1">Min</Badge>}
                  </td>
                  <td className="px-3 py-2"><Badge variant={r.risk_band === "high" ? "s1" : r.risk_band === "medium" ? "s2" : "s3"}>{r.risk_band}</Badge></td>
                  <td className="px-3 py-2">
                    {r.threat_band ? (
                      <Badge variant={r.threat_band === "critical" || r.threat_band === "high" ? "s1" : r.threat_band === "medium" ? "s2" : "s3"} title={r.threat_headline ?? undefined}>
                        {r.threat_band}
                      </Badge>
                    ) : (
                      <span className="text-[10px] text-muted">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <span className="numeric-callout text-navy">{r.footprint}</span>
                    <span className={r.neg_count > 0 ? "text-severity-1" : "text-muted"}> · {r.neg_count}</span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-block h-2 w-2 rounded-full" style={{ background: sentimentColor(r.net_sentiment) }} />
                    <span className="ml-1 text-xs tabular-nums">{r.net_sentiment != null ? r.net_sentiment.toFixed(2) : "—"}</span>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {r.top_signal_title ? (
                      <>
                        <div className="line-clamp-1 text-foreground/85">{r.top_signal_title}</div>
                        {r.top_signal_tags.length > 0 && (
                          <div className="mt-0.5 flex flex-wrap gap-1">
                            {r.top_signal_tags.slice(0, 1).map((t) => (
                              <span key={t} className="rounded bg-sand-deep px-1.5 py-0.5 text-[10px] text-muted">{t}</span>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <span className="text-muted">no recent signals</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function RiskTile({ band, count, description }: { band: "high" | "medium" | "low"; count: number; description: string }) {
  const color = band === "high" ? "var(--severity-1)" : band === "medium" ? "var(--bronze)" : "var(--muted)";
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="text-xs uppercase tracking-wider" style={{ color }}>{band} risk</div>
        <div className="numeric-callout mt-1 text-4xl text-navy">{count}</div>
        <p className="mt-1 text-xs text-muted">{description}</p>
      </CardContent>
    </Card>
  );
}
