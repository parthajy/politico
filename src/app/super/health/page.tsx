import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format, formatDistanceToNowStrict, subDays, subHours } from "date-fns";
import { ReclassifyOrphansButton } from "./reclassify-button";

export const dynamic = "force-dynamic";

const SOURCES = ["reddit", "youtube", "gdelt", "google_news", "rss", "manual"] as const;
const SOURCE_LABEL: Record<string, string> = {
  reddit: "Reddit · RSS", youtube: "YouTube Data API", gdelt: "GDELT 2.0",
  google_news: "Google News RSS", rss: "Indian outlet RSS", manual: "Manual intake",
};

export default async function HealthPage() {
  const sb = createClient();
  const now = new Date();
  const since24h = subHours(now, 24).toISOString();
  const since7d = subDays(now, 7).toISOString();

  // Source health: last sync + counts
  const { data: recentEvents } = await sb
    .from("events")
    .select("source, ingested_at")
    .order("ingested_at", { ascending: false })
    .limit(2000);

  const sourceLast = new Map<string, string>();
  const source24h = new Map<string, number>();
  const source7d = new Map<string, number>();
  for (const e of recentEvents ?? []) {
    if (!sourceLast.has(e.source)) sourceLast.set(e.source, e.ingested_at);
    if (e.ingested_at >= since24h) source24h.set(e.source, (source24h.get(e.source) ?? 0) + 1);
    if (e.ingested_at >= since7d) source7d.set(e.source, (source7d.get(e.source) ?? 0) + 1);
  }

  // Classifier errors from audit log
  const { data: classErrors } = await sb
    .from("audit_log")
    .select("id, created_at, metadata, entity_id")
    .in("action", ["classifier_error", "classification_insert_error", "classifier_skip"])
    .gte("created_at", since7d)
    .order("created_at", { ascending: false })
    .limit(30);

  // Unclassified events count — how many events sit without a classification
  const { count: eventsTotal } = await sb.from("events").select("id", { count: "exact", head: true });
  const { count: classifsTotal } = await sb.from("classifications").select("event_id", { count: "exact", head: true });
  const unclassified = (eventsTotal ?? 0) - (classifsTotal ?? 0);

  // Stub-classified events (intern-accepted but AI never enriched)
  const { count: stubsCount } = await sb
    .from("classifications")
    .select("event_id", { count: "exact", head: true })
    .eq("model_version", "manual_stub");

  const recoverable = Math.max(0, unclassified) + (stubsCount ?? 0);

  // Triage queue depth
  const { count: queueDepth } = await sb.from("field_submissions").select("id", { count: "exact", head: true }).in("status", ["pending", "needs_human"]);
  const { count: queueOld } = await sb.from("field_submissions").select("id", { count: "exact", head: true }).in("status", ["pending", "needs_human"]).lt("created_at", subHours(now, 24).toISOString());

  // Recent successful ingest runs (from audit log) — would need to wire if not present
  // Looking at /api/cron/ingest, it currently doesn't audit-log. Skip for now.

  return (
    <div className="container mx-auto max-w-6xl px-6 py-10">
      <div className="text-xs uppercase tracking-[0.18em] text-bronze">Superadmin</div>
      <h1 className="mt-2 font-serif text-3xl font-bold text-navy">Pipeline health</h1>
      <p className="mt-1 text-sm text-muted">Operational view — sources, classifier, queue depth, errors.</p>

      {/* Sources grid */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Sources</CardTitle>
          <CardDescription>Last ingest + volume by source.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {SOURCES.map((s) => {
              const last = sourceLast.get(s);
              const ageHours = last ? (Date.now() - new Date(last).getTime()) / 3600_000 : Infinity;
              const status = !last ? "never" : ageHours <= 6 ? "live" : ageHours <= 48 ? "recent" : ageHours <= 168 ? "idle" : "stale";
              const statusColor = status === "live" ? "var(--positive)" : status === "recent" ? "var(--bronze)" : status === "idle" ? "var(--muted)" : "var(--severity-1)";
              return (
                <div key={s} className="rounded border border-border bg-sand/40 p-3">
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-navy">{SOURCE_LABEL[s]}</div>
                    <Badge variant={status === "live" ? "positive" : status === "stale" || status === "never" ? "negative" : "default"}>{status}</Badge>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-muted">24h</div>
                      <div className="numeric-callout text-lg text-navy">{source24h.get(s) ?? 0}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-muted">7d</div>
                      <div className="numeric-callout text-lg text-navy">{source7d.get(s) ?? 0}</div>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-1.5 text-[10px] text-muted">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: statusColor }} />
                    {last ? <>Last sync {formatDistanceToNowStrict(new Date(last))} ago</> : <>Never synced from this deployment</>}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Classifier + queue */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Classifier</CardTitle>
            <CardDescription>Events vs classifications. Unclassified backlog should trend to zero.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-3 text-sm">
              <Stat label="Events total" value={(eventsTotal ?? 0).toLocaleString()} />
              <Stat label="Classified" value={(classifsTotal ?? 0).toLocaleString()} />
              <Stat label="Unclassified" value={unclassified.toLocaleString()} warn={unclassified > 0} />
              <Stat label="Stubs (await AI)" value={(stubsCount ?? 0).toLocaleString()} warn={(stubsCount ?? 0) > 0} />
            </div>
            {recoverable > 0 && (
              <div className="mt-3 flex items-center justify-between gap-3 rounded border border-bronze/40 bg-bronze/5 p-3">
                <div className="text-xs text-bronze-dark">
                  <span className="font-medium">{recoverable} event{recoverable === 1 ? " is" : "s are"} missing AI classification.</span>{" "}
                  Intern-accepted news is visible (stub scores) but won&apos;t rank correctly until classified.
                </div>
                <ReclassifyOrphansButton unclassified={recoverable} />
              </div>
            )}
            {recoverable === 0 && (
              <div className="mt-3 text-xs text-muted">
                Every event has a full AI classification.
                <span className="ml-3"><ReclassifyOrphansButton unclassified={0} /></span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Triage queue</CardTitle>
            <CardDescription>Field submissions awaiting intern review.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Stat label="Depth" value={(queueDepth ?? 0).toString()} warn={(queueDepth ?? 0) > 20} />
              <Stat label="Stale (>24h)" value={(queueOld ?? 0).toString()} warn={(queueOld ?? 0) > 5} />
            </div>
            <Link href="/firm/queue" className="mt-3 inline-block text-xs text-bronze underline">Open triage queue →</Link>
          </CardContent>
        </Card>
      </div>

      {/* Classifier errors */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Recent classifier errors</CardTitle>
          <CardDescription>From audit log, last 7 days. Batches that failed silently.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {(classErrors ?? []).length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-muted">No classifier errors in the last 7 days.</div>
          ) : (
            <ul className="divide-y divide-border">
              {(classErrors ?? []).map((r) => {
                const m = (r.metadata ?? {}) as Record<string, unknown>;
                return (
                  <li key={r.id} className="px-4 py-2.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-severity-1">{(m.error as string)?.slice(0, 120) ?? "unknown"}</span>
                      <span className="text-muted">{format(new Date(r.created_at), "d MMM HH:mm")}</span>
                    </div>
                    {m.batch_size ? <div className="mt-0.5 text-muted">batch_size={m.batch_size as number}</div> : null}
                    {r.entity_id && <div className="mt-0.5 font-mono text-[10px] text-muted">{(r.entity_id as string).slice(0, 80)}</div>}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="mt-6 text-center text-xs text-muted">
        <Link href="/super" className="text-bronze underline">← Back to overview</Link>
      </div>
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted">{label}</div>
      <div className={`numeric-callout text-2xl ${warn ? "text-severity-1" : "text-navy"}`}>{value}</div>
    </div>
  );
}
