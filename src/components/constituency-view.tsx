import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SentimentTrend } from "@/components/sentiment-sparkline";
import { sentimentColor, shortSource, sntBadge } from "@/lib/format";
import { formatDistanceToNowStrict } from "date-fns";

export type ConstituencyData = {
  constituency: { id: number; name: string; number: number; last_election_margin_pct: number | null };
  district: { id: number; name: string; tier: number | null; dominant_communities: string[] | null } | null;
  mla: { id: number; name: string; party: string | null; is_minister: boolean; portfolio: string | null; is_cm: boolean; is_deputy_cm: boolean } | null;
  recent_events: {
    id: string;
    title: string;
    source: string;
    snt_score: number | null;
    sentiment: number | null;
    published_at: string | null;
    url: string | null;
  }[];
  trend: { date: string; value: number }[];
  voices: { id: string; name: string; role: string | null; active: boolean; ever_paid: boolean; ever_scripted: boolean }[];
  stories: { id: string; title: string; status: string; outlet: string | null; reach_estimate: number | null }[];
};

export function ConstituencyView({ data, readOnly }: { data: ConstituencyData; readOnly: boolean }) {
  const m = data.mla;
  const c = data.constituency;
  const d = data.district;

  return (
    <div className="container mx-auto max-w-6xl px-6 py-10">
      <div className="text-xs uppercase tracking-[0.18em] text-bronze">
        Constituency #{c.number} {d ? `· ${d.name}` : ""}
      </div>
      <h1 className="mt-2 font-serif text-4xl font-bold text-navy">{c.name}</h1>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Sitting MLA</CardTitle>
          </CardHeader>
          <CardContent>
            {!m && <div className="text-sm text-muted">No MLA on record.</div>}
            {m && (
              <>
                <div className="font-serif text-xl font-bold text-navy">{m.name}</div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <Badge variant={m.party === "BJP" ? "navy" : "outline"}>{m.party ?? "—"}</Badge>
                  {m.is_cm && <Badge variant="bronze">Chief Minister</Badge>}
                  {m.is_deputy_cm && <Badge variant="bronze">Deputy CM</Badge>}
                  {m.is_minister && !m.is_cm && !m.is_deputy_cm && <Badge variant="default">Minister</Badge>}
                </div>
                {m.portfolio && (
                  <div className="mt-3">
                    <div className="text-xs uppercase tracking-wider text-muted">Portfolio</div>
                    <p className="mt-1 text-xs leading-relaxed text-foreground/80">{m.portfolio}</p>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>District</CardTitle>
          </CardHeader>
          <CardContent>
            {!d && <div className="text-sm text-muted">—</div>}
            {d && (
              <>
                <div className="text-lg font-medium text-navy">{d.name}</div>
                <div className="mt-1 text-xs text-muted">
                  {d.tier && <>Tier {d.tier} · </>}
                  {d.dominant_communities && d.dominant_communities.length > 0 && (
                    <>{d.dominant_communities.join(", ")}</>
                  )}
                </div>
                <div className="mt-3 text-xs text-muted">
                  Last poll margin:{" "}
                  <span className="text-navy">
                    {c.last_election_margin_pct != null ? `${c.last_election_margin_pct.toFixed(1)}%` : "—"}
                  </span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>30-day sentiment</CardTitle>
            <CardDescription>State trend used as fallback when seat-level data is sparse.</CardDescription>
          </CardHeader>
          <CardContent>
            <SentimentTrend series={data.trend} height={140} />
          </CardContent>
        </Card>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Recent signals</CardTitle>
              <CardDescription>{data.recent_events.length} matching this seat in the last 30 days.</CardDescription>
            </CardHeader>
            <CardContent>
              {data.recent_events.length === 0 && <div className="text-sm text-muted">No recent signals tagged to this seat.</div>}
              <div className="space-y-3">
                {data.recent_events.map((e) => {
                  const snt = sntBadge(e.snt_score ?? 0);
                  return (
                    <div key={e.id} className="flex gap-3 border-b border-border pb-3 last:border-0">
                      <Badge variant={snt.variant}>{snt.label}</Badge>
                      <div className="flex-1">
                        <div className="line-clamp-2 text-sm font-medium text-navy">
                          {e.url ? <a href={e.url} target="_blank" rel="noreferrer" className="hover:underline">{e.title}</a> : e.title}
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                          <span>{shortSource(e.source)}</span>
                          {e.published_at && <span>· {formatDistanceToNowStrict(new Date(e.published_at))} ago</span>}
                          <span className="ml-2 inline-block h-2 w-2 rounded-full" style={{ background: sentimentColor(e.sentiment) }} />
                          <span className="tabular-nums">{e.sentiment != null ? e.sentiment.toFixed(2) : "—"}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Local voices</CardTitle>
                {!readOnly && <Link href="/firm/voices" className="text-xs text-bronze underline">CRM</Link>}
              </div>
              <CardDescription>{data.voices.length} active in district.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.voices.length === 0 && <div className="text-sm text-muted">No voices recorded.</div>}
              {data.voices.slice(0, 6).map((v) => (
                <div key={v.id} className="flex items-center justify-between border-b border-border pb-2 last:border-0">
                  <div>
                    <div className="text-sm font-medium text-navy">{v.name}</div>
                    <div className="text-xs text-muted">{v.role ?? "—"}</div>
                  </div>
                  <div className="flex flex-col items-end gap-0.5">
                    {v.ever_paid ? <Badge variant="negative">paid</Badge> : <Badge variant="positive">unpaid</Badge>}
                    {v.ever_scripted ? <Badge variant="negative">scripted</Badge> : null}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Story pipeline</CardTitle>
                {!readOnly && <Link href="/firm/stories" className="text-xs text-bronze underline">Kanban</Link>}
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.stories.length === 0 && <div className="text-sm text-muted">No stories scoped to this seat yet.</div>}
              {data.stories.map((s) => (
                <div key={s.id} className="border-b border-border pb-2 last:border-0">
                  <div className="text-sm font-medium text-navy">{s.title}</div>
                  <div className="mt-0.5 text-xs text-muted">
                    {s.status} · {s.outlet ?? "outlet TBD"}{s.reach_estimate ? ` · ${(s.reach_estimate / 1000).toFixed(0)}k` : ""}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
