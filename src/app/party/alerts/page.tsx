import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StarButton } from "@/components/star-button";
import { formatDistanceToNowStrict } from "date-fns";
import { requireSession, isMinisterScope } from "@/lib/auth";

export const dynamic = "force-dynamic";

type SP = { severity?: "s1" | "s2" | "s3" };

export default async function PartyAlerts({ searchParams }: { searchParams: SP }) {
  const ctx = await requireSession();
  const sb = createClient();

  // For ministers: pre-compute the set of event_ids tagged to them, then
  // restrict alerts to ones referencing those events.
  let scopedEventIds: string[] | null = null;
  if (isMinisterScope(ctx)) {
    const s = ctx.scope;
    const { data: cls } = await sb
      .from("classifications")
      .select("event_id")
      .or(`mla_id.eq.${s.mla_id}${s.constituency_id ? `,constituency_id.eq.${s.constituency_id}` : ""}`)
      .limit(5000);
    scopedEventIds = (cls ?? []).map((r) => r.event_id);
    if (scopedEventIds.length === 0) {
      // No matching events → no matching alerts. Render the empty state cleanly.
      scopedEventIds = ["00000000-0000-0000-0000-000000000000"];
    }
  }

  let q = sb
    .from("alerts")
    .select("id, severity, title, body, event_id, created_at, resolved_at, classifications:event_id(constituency_id, district_id)")
    .order("created_at", { ascending: false })
    .limit(50);
  if (searchParams.severity) q = q.eq("severity", searchParams.severity);
  if (scopedEventIds) q = q.in("event_id", scopedEventIds);
  const { data: alerts } = await q;

  const active = (alerts ?? []).filter((a) => !a.resolved_at);
  const resolved = (alerts ?? []).filter((a) => a.resolved_at);

  // Pull my stars for the events these alerts reference
  const eventIds = active.map((a) => a.event_id).filter((x): x is string => !!x);
  const { data: { user } } = await sb.auth.getUser();
  const starredEvents = new Set<string>();
  if (user && eventIds.length > 0) {
    const { data: stars } = await sb.from("event_stars").select("event_id").eq("user_id", user.id).in("event_id", eventIds);
    for (const s of stars ?? []) starredEvents.add(s.event_id);
  }

  return (
    <div className="container mx-auto max-w-5xl px-6 py-10">
      <div className="text-xs uppercase tracking-[0.18em] text-bronze">Alerts</div>
      <h1 className="mt-2 font-serif text-3xl font-bold text-navy">Active alerts</h1>
      <p className="mt-1 text-sm text-muted">Auto-generated when SNT ≥ 0.8, or when the firm escalates a signal.</p>

      <div className="mt-4 flex items-center gap-1 rounded border border-border bg-white p-1 text-xs">
        {([
          { v: undefined, label: "All severities" },
          { v: "s1" as const, label: "S1" },
          { v: "s2" as const, label: "S2" },
          { v: "s3" as const, label: "S3" },
        ]).map((b) => {
          const active = (searchParams.severity ?? undefined) === b.v;
          const href = b.v ? `/party/alerts?severity=${b.v}` : `/party/alerts`;
          return (
            <Link key={b.label} href={href} className={`rounded px-3 py-1 ${active ? "bg-navy text-white" : "text-muted hover:text-foreground"}`}>
              {b.label}
            </Link>
          );
        })}
      </div>

      <div className="mt-6 grid gap-4">
        {active.length === 0 && (
          <Card><CardContent className="py-8 text-center text-sm text-muted">No active alerts. Refresh sources to ingest the latest signals.</CardContent></Card>
        )}
        {active.map((a) => {
          const cls = ((a.classifications as unknown) as { constituency_id: number | null } | null);
          return (
            <Card key={a.id} className="border-l-4" style={{ borderLeftColor: a.severity === "s1" ? "var(--severity-1)" : "var(--bronze)" }}>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <CardTitle>{a.title}</CardTitle>
                  <div className="flex items-center gap-2">
                    {a.event_id && <StarButton eventId={a.event_id} initialStarred={starredEvents.has(a.event_id)} />}
                    <Badge variant={a.severity === "s1" ? "s1" : "s2"}>{a.severity.toUpperCase()}</Badge>
                  </div>
                </div>
                <CardDescription>{formatDistanceToNowStrict(new Date(a.created_at))} ago</CardDescription>
              </CardHeader>
              <CardContent>
                {a.body && <p className="text-sm text-foreground/85">{a.body}</p>}
                {cls?.constituency_id && (
                  <Link href={`/party/constituency/${cls.constituency_id}`} className="mt-3 inline-block text-xs text-bronze underline">
                    Open constituency →
                  </Link>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {resolved.length > 0 && (
        <>
          <h2 className="mt-12 font-serif text-lg font-bold text-navy">Resolved</h2>
          <div className="mt-3 space-y-2">
            {resolved.map((a) => (
              <div key={a.id} className="flex items-center justify-between rounded border border-border bg-sand-deep/40 px-3 py-2 text-sm">
                <div className="line-clamp-1 text-muted">{a.title}</div>
                <span className="text-xs text-muted">resolved {formatDistanceToNowStrict(new Date(a.resolved_at!))} ago</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
