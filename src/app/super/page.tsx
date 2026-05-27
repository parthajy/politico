import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNowStrict, subDays, subHours } from "date-fns";

export const dynamic = "force-dynamic";

const ROLE_COLOR: Record<string, "navy" | "bronze" | "default" | "positive"> = {
  superadmin: "bronze",
  firm_admin: "navy",
  firm_analyst: "navy",
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
    <div className="container mx-auto max-w-7xl px-6 py-10">
      <div className="text-xs uppercase tracking-[0.18em] text-bronze">Superadmin</div>
      <h1 className="mt-2 font-serif text-3xl font-bold text-navy">Overview</h1>
      <p className="mt-1 text-sm text-muted">Everything in one place. Five panels: People, System pulse, Activity, Client engagement, Pipeline health.</p>

      {/* People panel */}
      <Card className="mt-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>People</CardTitle>
            <Link href="/super/team" className="text-xs text-bronze underline">Manage team →</Link>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {Object.entries(counts).sort().map(([role, n]) => (
              <Badge key={role} variant={ROLE_COLOR[role] ?? "default"}>{labelRole(role)} · {n}</Badge>
            ))}
            {Object.keys(counts).length === 0 && <span className="text-xs text-muted">No users yet.</span>}
          </div>
        </CardContent>
      </Card>

      {/* System pulse — today */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>System pulse</CardTitle>
          <CardDescription>Rolled across the last 24 hours unless noted.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-4">
            <Stat label="Signals · 24h" value={(signals24 ?? 0).toLocaleString()} />
            <Stat label="Classified · 24h" value={(classifs24 ?? 0).toLocaleString()} />
            <Stat label="Queue pending" value={(queueAll ?? 0).toString()} warn={(queueAll ?? 0) > 10} />
            <Stat label="Triage actions · 24h" value={(triageDone24 ?? 0).toString()} />
            <Stat label="Stories published · 7d" value={(storiesPub7 ?? 0).toString()} />
            <Stat label="Briefs published · 7d" value={(briefsPub7 ?? 0).toString()} />
            <Stat label="Decisions logged · 7d" value={(decisions7 ?? 0).toString()} />
            <Stat label="Active alerts (S1+S2)" value={(alertsActive ?? 0).toString()} warn={(alertsActive ?? 0) > 8} />
          </div>
        </CardContent>
      </Card>

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
      <Card className="mt-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Pipeline health</CardTitle>
            <Link href="/super/health" className="text-xs text-bronze underline">All sources →</Link>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 md:grid-cols-3 lg:grid-cols-6">
            {SOURCES.map((s) => {
              const last = sourceLast.get(s);
              const ageHours = last ? (Date.now() - new Date(last).getTime()) / 3600_000 : Infinity;
              const today = sourceToday.get(s) ?? 0;
              const status = !last ? "—" : ageHours <= 6 ? "live" : ageHours <= 48 ? "recent" : ageHours <= 168 ? "idle" : "stale";
              return (
                <div key={s} className="rounded border border-border bg-sand/40 p-3 text-xs">
                  <div className="font-medium text-navy">{s}</div>
                  <div className="mt-1 text-[10px] uppercase tracking-wider text-muted">{status}</div>
                  <div className="mt-1 numeric-callout text-sm text-navy">{today} <span className="text-[10px] text-muted">today</span></div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted">{label}</div>
      <div className={`numeric-callout mt-0.5 text-2xl ${warn ? "text-severity-1" : "text-navy"}`}>{value}</div>
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
