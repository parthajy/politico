import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNowStrict } from "date-fns";

export const dynamic = "force-dynamic";

export default async function PartyAlerts() {
  const sb = createClient();
  const { data: alerts } = await sb
    .from("alerts")
    .select("id, severity, title, body, event_id, created_at, resolved_at, classifications:event_id(constituency_id, district_id)")
    .order("created_at", { ascending: false })
    .limit(50);

  const active = (alerts ?? []).filter((a) => !a.resolved_at);
  const resolved = (alerts ?? []).filter((a) => a.resolved_at);

  return (
    <div className="container mx-auto max-w-5xl px-6 py-10">
      <div className="text-xs uppercase tracking-[0.18em] text-bronze">Alerts</div>
      <h1 className="mt-2 font-serif text-3xl font-bold text-navy">Active alerts</h1>
      <p className="mt-1 text-sm text-muted">Auto-generated when SNT ≥ 0.8, or when the firm escalates a signal.</p>

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
                  <Badge variant={a.severity === "s1" ? "s1" : "s2"}>{a.severity.toUpperCase()}</Badge>
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
