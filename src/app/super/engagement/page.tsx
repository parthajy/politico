import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNowStrict, subDays } from "date-fns";

export const dynamic = "force-dynamic";

export default async function EngagementPage({ searchParams }: { searchParams: { days?: string } }) {
  const sb = createClient();
  const days = Math.max(1, Math.min(30, parseInt(searchParams.days ?? "7", 10) || 7));
  const since = subDays(new Date(), days).toISOString();

  // Pull all party_view audit rows in window
  const { data: views } = await sb
    .from("audit_log")
    .select("entity_id, created_at, user_id, users(full_name, email)")
    .eq("action", "party_view")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(2000);

  const total = (views ?? []).length;

  // By path
  const byPath = new Map<string, number>();
  for (const v of views ?? []) {
    const p = normalisePath(v.entity_id);
    byPath.set(p, (byPath.get(p) ?? 0) + 1);
  }
  const pathRanked = Array.from(byPath.entries()).sort((a, b) => b[1] - a[1]).slice(0, 15);

  // By hour of day
  const hourBuckets = new Array(24).fill(0);
  for (const v of views ?? []) hourBuckets[new Date(v.created_at).getHours()]++;
  const peakHour = hourBuckets.indexOf(Math.max(...hourBuckets));
  const peakLabel = `${String(peakHour).padStart(2, "0")}:00`;

  // By user (mostly one CMO; multi-user when staff also has party_viewer)
  const byUser = new Map<string, { name: string; count: number }>();
  for (const v of views ?? []) {
    const u = (v.users as unknown) as { full_name: string | null; email: string } | null;
    const name = u?.full_name ?? u?.email ?? "—";
    const key = v.user_id ?? name;
    const cur = byUser.get(key) ?? { name, count: 0 };
    cur.count++;
    byUser.set(key, cur);
  }
  const userRanked = Array.from(byUser.values()).sort((a, b) => b.count - a.count);

  // Recent stars by party_viewer — what they bookmarked
  const { data: stars } = await sb
    .from("event_stars")
    .select("event_id, note, created_at, users!inner(full_name, email, role), events!inner(id, title, source, url)")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(20);
  const partyStars = (stars ?? []).filter((s) => {
    const u = (s.users as unknown) as { role: string } | null;
    return u?.role === "party_viewer";
  });

  return (
    <div className="container mx-auto max-w-6xl px-6 py-10">
      <div className="text-xs uppercase tracking-[0.18em] text-bronze">Superadmin</div>
      <h1 className="mt-2 font-serif text-3xl font-bold text-navy">Client engagement</h1>
      <p className="mt-1 text-sm text-muted">
        What the cabinet office actually opens. Last {days} day{days === 1 ? "" : "s"}.
      </p>

      <div className="mt-4 flex gap-2">
        {[1, 7, 30].map((d) => (
          <Link key={d} href={`?days=${d}`} className={`rounded border px-3 py-1 text-xs ${d === days ? "border-navy bg-navy text-white" : "border-border bg-white text-muted hover:bg-sand"}`}>
            {d === 1 ? "24h" : `${d}d`}
          </Link>
        ))}
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-4">
        <Tile label="Total page views" value={total.toLocaleString()} />
        <Tile label="Unique sessions" value={userRanked.length.toString()} />
        <Tile label="Peak hour" value={peakLabel} />
        <Tile label="Avg / day" value={(total / days).toFixed(1)} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Most-opened pages</CardTitle>
            <CardDescription>Which sections the CMO actually consumes.</CardDescription>
          </CardHeader>
          <CardContent>
            {pathRanked.length === 0 ? <Empty>No party-side traffic in this window.</Empty> : (
              <ul className="space-y-1.5 text-sm">
                {pathRanked.map(([p, n]) => (
                  <li key={p} className="flex items-center justify-between border-b border-border pb-1.5 last:border-0">
                    <span className="font-mono text-xs text-navy">{p}</span>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-sand-deep">
                        <div className="h-full rounded-full bg-navy" style={{ width: `${Math.max(4, Math.round((n / pathRanked[0][1]) * 100))}%` }} />
                      </div>
                      <span className="numeric-callout w-10 text-right text-sm text-navy">{n}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Time-of-day pattern</CardTitle>
            <CardDescription>Peak: {peakLabel} ({hourBuckets[peakHour]} views).</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-0.5 h-32">
              {hourBuckets.map((n, h) => {
                const maxBucket = Math.max(1, ...hourBuckets);
                const pct = Math.max(2, Math.round((n / maxBucket) * 100));
                return (
                  <div key={h} className="flex-1 bg-navy/80 hover:bg-navy" style={{ height: `${pct}%` }} title={`${String(h).padStart(2, "0")}:00 — ${n} views`} />
                );
              })}
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-muted">
              <span>00</span><span>06</span><span>12</span><span>18</span><span>24</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>What the CMO starred ({partyStars.length})</CardTitle>
          <CardDescription>Events the CMO bookmarked themselves. Your strongest engagement signal.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {partyStars.length === 0 ? <Empty>No stars from party-side users in this window.</Empty> : (
            partyStars.map((s) => {
              const ev = (s.events as unknown) as { id: string; title: string; source: string; url: string | null };
              const u = (s.users as unknown) as { full_name: string | null; email: string };
              return (
                <div key={`${s.event_id}-${s.created_at}`} className="border-b border-border pb-2 last:border-0">
                  <div className="line-clamp-2 text-sm font-medium text-navy">
                    {ev.url ? <a href={ev.url} target="_blank" rel="noreferrer" className="hover:underline">{ev.title}</a> : ev.title}
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted">
                    {u.full_name ?? u.email} · {formatDistanceToNowStrict(new Date(s.created_at))} ago
                    {s.note && <span className="italic"> — &ldquo;{s.note}&rdquo;</span>}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {userRanked.length > 1 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>By user</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5 text-sm">
              {userRanked.map((u) => (
                <li key={u.name} className="flex items-center justify-between border-b border-border pb-1.5 last:border-0">
                  <span className="text-navy">{u.name}</span>
                  <Badge variant="default">{u.count} views</Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="mt-6 text-center text-xs text-muted">
        <Link href="/super" className="text-bronze underline">← Back to overview</Link>
      </div>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <Card><CardContent className="pt-5">
      <div className="text-[10px] uppercase tracking-wider text-muted">{label}</div>
      <div className="numeric-callout mt-1 text-3xl text-navy">{value}</div>
    </CardContent></Card>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded border border-dashed border-border p-4 text-center text-xs text-muted">{children}</div>;
}

function normalisePath(raw: string | null): string {
  if (!raw) return "/party";
  // collapse dynamic segments like /party/constituency/13 → /party/constituency/[id]
  return raw
    .replace(/\/[0-9]+(\/|$)/g, "/[id]$1")
    .replace(/\/[0-9a-f-]{36}(\/|$)/g, "/[uuid]$1")
    .slice(0, 80);
}
