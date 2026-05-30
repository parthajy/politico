import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import { formatDistanceToNowStrict, subDays, subHours } from "date-fns";

export const dynamic = "force-dynamic";

const ROLE_COLOR: Record<string, "bronze-soft" | "default" | "positive" | "s2-soft"> = {
  superadmin: "bronze-soft",
  firm_admin: "s2-soft",
  firm_analyst: "s2-soft",
  firm_intern: "default",
  party_viewer: "positive",
  volunteer: "default",
};

export default async function SuperOverview() {
  const sb = createClient();
  const now = new Date();
  const since24h = subHours(now, 24).toISOString();
  const since7d = subDays(now, 7).toISOString();

  // People
  const { data: users } = await sb.from("users").select("role").in("role", ["superadmin", "firm_admin", "firm_analyst", "firm_intern", "party_viewer", "volunteer"]);
  const counts: Record<string, number> = {};
  for (const u of users ?? []) counts[u.role] = (counts[u.role] ?? 0) + 1;

  // System pulse — today
  const [
    { count: signals24 }, { count: classifs24 }, { count: queueAll },
    { count: triageDone24 }, { count: storiesPub7 }, { count: briefsPub7 },
    { count: decisions7 }, { count: alertsActive },
  ] = await Promise.all([
    sb.from("events").select("id", { count: "exact", head: true }).gte("ingested_at", since24h),
    sb.from("classifications").select("event_id", { count: "exact", head: true }).gte("classified_at", since24h),
    sb.from("field_submissions").select("id", { count: "exact", head: true }).in("status", ["pending", "needs_human"]),
    sb.from("audit_log").select("id", { count: "exact", head: true }).gte("created_at", since24h).in("action", ["triage_escalated", "triage_monitoring", "triage_closed", "queue_accept", "queue_reject"]),
    sb.from("stories").select("id", { count: "exact", head: true }).eq("status", "published").gte("published_at", since7d),
    sb.from("briefs").select("id", { count: "exact", head: true }).not("published_at", "is", null).gte("published_at", since7d),
    sb.from("decisions").select("id", { count: "exact", head: true }).gte("decided_on", since7d.slice(0, 10)),
    sb.from("alerts").select("id", { count: "exact", head: true }).is("resolved_at", null).in("severity", ["s1", "s2"]),
  ]);

  // Recent activity
  const { data: recent } = await sb
    .from("audit_log")
    .select("id, action, created_at, entity_type, entity_id, users(full_name, email, role)")
    .order("created_at", { ascending: false })
    .limit(8);

  // Client engagement (party_view audit entries, grouped by path) — last 24h
  const { data: views } = await sb
    .from("audit_log")
    .select("entity_id, created_at")
    .eq("action", "party_view")
    .gte("created_at", since24h)
    .limit(500);
  const viewCounts = new Map<string, number>();
  for (const v of views ?? []) {
    const path = (v.entity_id ?? "/party").slice(0, 60);
    viewCounts.set(path, (viewCounts.get(path) ?? 0) + 1);
  }
  const topViews = Array.from(viewCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);

  // Pipeline health
  const sinceMidnight = new Date(); sinceMidnight.setHours(0, 0, 0, 0);
  const { data: sources } = await sb
    .from("events")
    .select("source, ingested_at")
    .order("ingested_at", { ascending: false })
    .limit(500);
  const sourceLast = new Map<string, string>();
  const sourceToday = new Map<string, number>();
  for (const e of sources ?? []) {
    if (!sourceLast.has(e.source)) sourceLast.set(e.source, e.ingested_at);
    if (new Date(e.ingested_at) >= sinceMidnight) {
      sourceToday.set(e.source, (sourceToday.get(e.source) ?? 0) + 1);
    }
  }
  const SOURCES = ["reddit", "youtube", "gdelt", "google_news", "rss", "manual"];

  return (
    <div className="container mx-auto max-w-7xl px-6 py-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-bronze">Superadmin</div>
          <h1 className="mt-2 font-serif text-3xl font-bold text-navy">Overview</h1>
          <p className="mt-1 text-sm text-muted">Everything in one place — people, system pulse, activity, engagement, pipeline health.</p>
        </div>
        <Link href="/super/team" className="text-xs font-medium text-bronze hover:text-bronze-dark">Manage team →</Link>
      </div>

      {/* People — converted from chip-list to stat-card grid */}
      <div className="mt-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {(["superadmin", "firm_admin", "firm_analyst", "firm_intern", "party_viewer", "volunteer"] as const).map((role) => (
          <StatCard
            key={role}
            label={labelRole(role)}
            value={(counts[role] ?? 0).toString()}
            hint={role === "volunteer" ? "Field network" : role === "party_viewer" ? "Govt principals" : role === "firm_intern" ? "Queue triage" : "Workbench"}
          />
        ))}
      </div>

      {/* System pulse — top KPIs */}
      <section className="mt-8">
        <div className="mb-3 flex items-end justify-between">
          <div>
            <h2 className="font-serif text-lg font-bold text-navy">System pulse</h2>
            <p className="text-xs text-muted">Rolled across the last 24 hours unless noted.</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Signals · 24h"
            value={(signals24 ?? 0).toLocaleString()}
            hint={`${(classifs24 ?? 0).toLocaleString()} classified by AI`}
          />
          <StatCard
            label="Triage queue"
            value={(queueAll ?? 0).toString()}
            hint={(queueAll ?? 0) > 10 ? "Backlog — drain it" : "Healthy"}
            delta={(queueAll ?? 0) > 10 ? { value: "Action", tone: "negative" } : undefined}
          />
          <StatCard
            label="Triage actions · 24h"
            value={(triageDone24 ?? 0).toString()}
            hint="Interns + analysts acting on signals"
          />
          <StatCard
            label="Active S1 / S2"
            value={(alertsActive ?? 0).toString()}
            hint={(alertsActive ?? 0) > 0 ? "Unresolved" : "All clear"}
            delta={(alertsActive ?? 0) > 0
              ? { value: "Live", tone: "negative" }
              : { value: "Clear", tone: "positive" }}
          />
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <StatCard label="Stories published · 7d" value={(storiesPub7 ?? 0).toString()} />
          <StatCard label="Briefs published · 7d" value={(briefsPub7 ?? 0).toString()} />
          <StatCard label="Decisions logged · 7d" value={(decisions7 ?? 0).toString()} />
        </div>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Activity feed */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Activity</CardTitle>
              <Link href="/super/activity" className="text-xs text-bronze underline">Full log →</Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {(recent ?? []).length === 0 && <div className="text-xs text-muted">No activity yet.</div>}
            {(recent ?? []).map((r) => {
              const u = (r.users as unknown) as { full_name: string | null; email: string; role: string } | null;
              return (
                <div key={r.id} className="border-b border-border pb-2 text-sm last:border-0">
                  <div className="flex items-center gap-2">
                    <Badge variant={ROLE_COLOR[u?.role ?? "default"] ?? "default"}>{labelRole(u?.role ?? "?")}</Badge>
                    <span className="font-medium text-navy">{u?.full_name ?? u?.email ?? "?"}</span>
                    <span className="text-xs text-muted">· {humanAction(r.action)}</span>
                    <span className="ml-auto text-[10px] text-muted">{formatDistanceToNowStrict(new Date(r.created_at))} ago</span>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Client engagement */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Client engagement · 24h</CardTitle>
              <Link href="/super/engagement" className="text-xs text-bronze underline">Detail →</Link>
            </div>
            <CardDescription>What the CMO is opening on the cabinet view.</CardDescription>
          </CardHeader>
          <CardContent>
            {topViews.length === 0 && <div className="text-xs text-muted">No CMO activity in the last 24h.</div>}
            <ul className="space-y-2 text-sm">
              {topViews.map(([path, n]) => (
                <li key={path} className="flex items-center justify-between border-b border-border pb-1.5 last:border-0">
                  <span className="font-mono text-xs text-navy">{path}</span>
                  <span className="numeric-callout text-sm text-navy">{n}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Pipeline health */}
      <Card className="mt-8">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Pipeline health</CardTitle>
            <Link href="/super/health" className="text-xs font-medium text-bronze hover:text-bronze-dark">All sources →</Link>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
            {SOURCES.map((s) => {
              const last = sourceLast.get(s);
              const ageHours = last ? (Date.now() - new Date(last).getTime()) / 3600_000 : Infinity;
              const today = sourceToday.get(s) ?? 0;
              const status = !last ? "never" : ageHours <= 6 ? "live" : ageHours <= 48 ? "recent" : ageHours <= 168 ? "idle" : "stale";
              const statusVariant = status === "live" ? "positive" : status === "recent" ? "bronze-soft" : status === "stale" || status === "never" ? "s1-soft" : "s3-soft";
              return (
                <div key={s} className="rounded-xl border border-border bg-white p-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium text-navy capitalize">{s.replace("_", " ")}</div>
                    <Badge variant={statusVariant as never}>{status}</Badge>
                  </div>
                  <div className="mt-2 numeric-callout text-lg text-navy">{today}
                    <span className="ml-1 text-[10px] font-sans font-normal text-muted">today</span>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function labelRole(r: string): string {
  switch (r) {
    case "superadmin": return "Superadmin";
    case "firm_admin": return "Admin";
    case "firm_analyst": return "Analyst";
    case "firm_intern": return "Intern";
    case "party_viewer": return "CMO";
    case "volunteer": return "Volunteer";
    default: return r;
  }
}

function humanAction(a: string): string {
  return a.replace(/_/g, " ");
}
