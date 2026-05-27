import Link from "next/link";
import { notFound } from "next/navigation";
import { loadEntity, type EntityScope } from "@/lib/loaders/entity";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { sntBadge, sentimentColor, shortSource } from "@/lib/format";
import { format, formatDistanceToNowStrict } from "date-fns";

export const dynamic = "force-dynamic";

const VALID: EntityScope[] = ["person", "district", "constituency", "topic"];

export default async function EntityPage({ params }: { params: { scope: string; id: string } }) {
  const scope = params.scope as EntityScope;
  if (!VALID.includes(scope)) notFound();

  const data = await loadEntity(scope, params.id);
  if (!data) notFound();

  const sentToday = data.net_sentiment_today;

  return (
    <div className="container mx-auto max-w-5xl px-6 py-10">
      <div className="text-xs uppercase tracking-[0.18em] text-bronze">{scope}</div>
      <div className="mt-2 flex items-baseline gap-3">
        <h1 className="font-serif text-4xl font-bold text-navy">{data.header.display_name}</h1>
        {data.header.badges.map((b) => (
          <Badge key={b.label} variant={b.tone}>{b.label}</Badge>
        ))}
      </div>
      {data.header.subtitle && <p className="mt-1 text-sm text-muted">{data.header.subtitle}</p>}

      {/* Headline numbers */}
      <div className="mt-6 grid gap-3 md:grid-cols-4">
        <Tile label="Signals · 30d" value={data.signal_count_30d.toString()} />
        <Tile label="Negative · 30d" value={data.negative_count_30d.toString()} tone={data.negative_count_30d > 0 ? "warn" : "default"} />
        <Tile label="Net sentiment" value={sentToday != null ? (sentToday >= 0 ? "+" : "") + sentToday.toFixed(2) : "—"} dot={sentToday != null ? sentimentColor(sentToday) : undefined} />
        <Tile label="Active voices nearby" value={data.related_voices.length.toString()} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_280px]">
        {/* Timeline */}
        <Card>
          <CardHeader>
            <CardTitle>Memory timeline</CardTitle>
            <p className="text-xs text-muted">Every signal, decision, alert, story, and threat assessment connected to this entity.</p>
          </CardHeader>
          <CardContent>
            {data.timeline.length === 0 ? (
              <div className="rounded border border-dashed border-border p-6 text-center text-xs text-muted">Nothing recorded yet.</div>
            ) : (
              <ul className="space-y-3">
                {data.timeline.map((t) => (
                  <li key={`${t.kind}-${t.id}`} className="border-l-2 pl-3" style={{ borderColor: kindColor(t.kind) }}>
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted">
                      <span style={{ color: kindColor(t.kind) }}>{kindLabel(t)}</span>
                      <span>· {formatDistanceToNowStrict(new Date(t.date))} ago</span>
                      <span className="text-muted/60">· {format(new Date(t.date), "d MMM")}</span>
                    </div>
                    {renderItem(t)}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Voices rail */}
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader><CardTitle>Voices in scope</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {data.related_voices.length === 0 && <div className="text-xs text-muted">No active voices here.</div>}
              {data.related_voices.map((v) => (
                <div key={v.id} className="flex items-center justify-between border-b border-border pb-1.5 last:border-0">
                  <div>
                    <div className="font-medium text-navy">{v.name}</div>
                    <div className="text-[10px] text-muted">{v.role ?? "—"}</div>
                  </div>
                  {(v.placement_count ?? 0) > 0 && (
                    <Badge variant="bronze">{v.placement_count} placed</Badge>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Jump to</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Link href="/firm" className="block text-bronze hover:underline">→ Inbox</Link>
              <Link href="/firm/decisions" className="block text-bronze hover:underline">→ Decisions</Link>
              <Link href="/firm/stories" className="block text-bronze hover:underline">→ Story pipeline</Link>
              {scope === "constituency" && <Link href={`/firm/constituency/${data.header.id}`} className="block text-bronze hover:underline">→ Seat dashboard</Link>}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Tile({ label, value, tone = "default", dot }: { label: string; value: string; tone?: "default" | "warn"; dot?: string }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="text-[10px] uppercase tracking-wider text-muted">{label}</div>
        <div className={`numeric-callout mt-1 flex items-center gap-1.5 text-3xl ${tone === "warn" ? "text-severity-1" : "text-navy"}`}>
          {dot && <span className="h-2 w-2 rounded-full" style={{ background: dot }} />}
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

function kindColor(k: string): string {
  switch (k) {
    case "event": return "var(--navy)";
    case "decision": return "var(--bronze)";
    case "story": return "var(--positive)";
    case "alert": return "var(--severity-1)";
    case "threat": return "var(--severity-1)";
    case "snapshot": return "var(--muted)";
    default: return "var(--muted)";
  }
}

function kindLabel(t: import("@/lib/loaders/entity").TimelineItem): string {
  switch (t.kind) {
    case "event": return `Signal · ${shortSource(t.source)}`;
    case "decision": return `Decision · ${t.kind_label}`;
    case "story": return `Story · ${t.status}`;
    case "alert": return `Alert · ${t.severity.toUpperCase()}${t.resolved ? " · resolved" : ""}`;
    case "threat": return `Threat · ${t.band.toUpperCase()}`;
    case "snapshot": return "Sentiment snapshot";
  }
}

function renderItem(t: import("@/lib/loaders/entity").TimelineItem): React.ReactNode {
  switch (t.kind) {
    case "event":
      return (
        <div>
          <div className="mt-0.5 flex items-start gap-2">
            {t.snt_score != null && <Badge variant={sntBadge(t.snt_score).variant}>{sntBadge(t.snt_score).label}</Badge>}
            <div className="line-clamp-2 text-sm font-medium text-navy">
              {t.url ? <a href={t.url} target="_blank" rel="noreferrer" className="hover:underline">{t.title}</a> : t.title}
            </div>
          </div>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-muted">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: sentimentColor(t.sentiment) }} />
            <span className="tabular-nums">{t.sentiment != null ? t.sentiment.toFixed(2) : "—"}</span>
            {t.topic_tags.slice(0, 2).map((tag) => (
              <span key={tag} className="rounded bg-sand-deep px-1.5 py-0.5 text-[10px] text-muted">{tag}</span>
            ))}
          </div>
        </div>
      );
    case "decision":
      return (
        <div>
          <div className="mt-0.5 text-sm font-medium text-navy">{t.title}</div>
          {t.summary && <p className="mt-1 text-xs text-foreground/85">{t.summary}</p>}
          {t.outcome && <p className="mt-1 text-[11px] italic text-muted">Outcome: {t.outcome}</p>}
        </div>
      );
    case "story":
      return (
        <div>
          <div className="mt-0.5 text-sm font-medium text-navy">
            {t.url ? <a href={t.url} target="_blank" rel="noreferrer" className="hover:underline">{t.title}</a> : t.title}
          </div>
          <div className="mt-0.5 text-[11px] text-muted">{t.outlet ?? "(outlet TBD)"}</div>
        </div>
      );
    case "alert":
      return <div className="mt-0.5 line-clamp-2 text-sm font-medium text-navy">{t.title}</div>;
    case "threat":
      return <p className="mt-0.5 text-sm text-foreground/85">{t.headline}</p>;
    case "snapshot":
      return (
        <div className="mt-0.5 flex items-center gap-2 text-sm">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: sentimentColor(t.net_sentiment) }} />
          <span className="numeric-callout text-navy">{(t.net_sentiment >= 0 ? "+" : "") + t.net_sentiment.toFixed(2)}</span>
        </div>
      );
  }
}
