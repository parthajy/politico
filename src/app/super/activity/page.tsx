import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ActivityFilters } from "./filters";
import { format, formatDistanceToNowStrict } from "date-fns";

export const dynamic = "force-dynamic";

const ROLE_COLOR: Record<string, "navy" | "bronze" | "default" | "positive"> = {
  superadmin: "bronze", firm_admin: "navy", firm_analyst: "navy",
  firm_intern: "default", party_viewer: "positive", volunteer: "default",
};
const ACTION_TONE: Record<string, "s1" | "s2" | "default" | "positive" | "navy"> = {
  triage_escalated: "s1", queue_reject: "s1", brief_publish: "positive",
  brief_generate: "navy", queue_accept: "positive", decision_record: "navy",
  agenda_generate: "navy", threat_generate: "s2", threat_generate_all: "s2",
  field_submission: "default", party_view: "default", event_star: "default",
};

type SP = { user?: string; action?: string; role?: string; days?: string };

export default async function ActivityPage({ searchParams }: { searchParams: SP }) {
  const sb = createClient();

  const days = Math.max(1, Math.min(90, parseInt(searchParams.days ?? "7", 10) || 7));
  const since = new Date(Date.now() - days * 86400_000).toISOString();

  let query = sb
    .from("audit_log")
    .select("id, action, created_at, entity_type, entity_id, metadata, user_id, users(full_name, email, role)")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(200);

  if (searchParams.action) query = query.eq("action", searchParams.action);
  if (searchParams.user) query = query.eq("user_id", searchParams.user);

  const { data: rows } = await query;
  let items = rows ?? [];

  if (searchParams.role) {
    items = items.filter((r) => {
      const u = (r.users as unknown) as { role: string } | null;
      return u?.role === searchParams.role;
    });
  }

  // For filter dropdowns
  const { data: distinctActions } = await sb.from("audit_log").select("action").gte("created_at", since).limit(1000);
  const actionList = Array.from(new Set((distinctActions ?? []).map((r) => r.action))).sort();
  const { data: usersList } = await sb.from("users").select("id, full_name, email").order("full_name");

  // Aggregates
  const byAction = new Map<string, number>();
  for (const r of items) byAction.set(r.action, (byAction.get(r.action) ?? 0) + 1);
  const topActions = Array.from(byAction.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <div className="container mx-auto max-w-6xl px-6 py-10">
      <div className="text-xs uppercase tracking-[0.18em] text-bronze">Superadmin</div>
      <h1 className="mt-2 font-serif text-3xl font-bold text-navy">Activity log</h1>
      <p className="mt-1 text-sm text-muted">
        Every mutating action across all roles, last {days} day{days === 1 ? "" : "s"}.
      </p>

      <ActivityFilters
        actions={actionList}
        users={usersList ?? []}
        initial={searchParams}
      />

      <div className="mt-4 flex flex-wrap gap-2">
        <span className="text-xs text-muted">Top in window:</span>
        {topActions.map(([a, n]) => (
          <Badge key={a} variant={ACTION_TONE[a] ?? "default"}>{humanAction(a)} · {n}</Badge>
        ))}
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Events ({items.length})</CardTitle>
          <CardDescription>Newest first. Capped at 200; narrow with filters.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-muted">No activity matches.</div>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((r) => {
                const u = (r.users as unknown) as { full_name: string | null; email: string; role: string } | null;
                return (
                  <li key={r.id} className="grid grid-cols-[180px_120px_1fr_140px] items-start gap-3 px-4 py-2.5 text-sm">
                    <div>
                      <div className="font-medium text-navy">{u?.full_name ?? u?.email?.split("@")[0] ?? "system"}</div>
                      <div className="text-[10px] text-muted">
                        {u?.role && <Badge variant={ROLE_COLOR[u.role] ?? "default"}>{labelRole(u.role)}</Badge>}
                      </div>
                    </div>
                    <div>
                      <Badge variant={ACTION_TONE[r.action] ?? "default"}>{humanAction(r.action)}</Badge>
                    </div>
                    <div className="text-xs text-foreground/85">
                      {r.entity_type && <span className="text-muted">{r.entity_type}</span>}
                      {r.entity_id && <span className="ml-2 font-mono text-[10px] text-muted">{r.entity_id.slice(0, 36)}</span>}
                      {renderMeta(r.metadata as Record<string, unknown> | null)}
                    </div>
                    <div className="text-right text-[11px] text-muted">
                      <div>{formatDistanceToNowStrict(new Date(r.created_at))} ago</div>
                      <div>{format(new Date(r.created_at), "d MMM HH:mm")}</div>
                    </div>
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

function humanAction(a: string) { return a.replace(/_/g, " "); }
function labelRole(r: string): string {
  return ({ superadmin: "Superadmin", firm_admin: "Admin", firm_analyst: "Analyst", firm_intern: "Intern", party_viewer: "CMO", volunteer: "Volunteer" } as Record<string, string>)[r] ?? r;
}
function renderMeta(meta: Record<string, unknown> | null): React.ReactNode {
  if (!meta) return null;
  const interesting = ["snt_score", "threat_band", "classified", "ms", "human_edited", "rec_count", "suggestion_count"];
  const parts: string[] = [];
  for (const k of interesting) {
    if (meta[k] !== undefined && meta[k] !== null) parts.push(`${k}: ${typeof meta[k] === "number" ? (meta[k] as number).toFixed?.(2) ?? meta[k] : meta[k]}`);
  }
  if (parts.length === 0) return null;
  return <span className="ml-2 text-[10px] text-muted">· {parts.join(" · ")}</span>;
}
