import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNowStrict } from "date-fns";
import { StatusButtons } from "./status-buttons";

export const dynamic = "force-dynamic";

type Status = "new" | "triaged" | "in_progress" | "done" | "wontfix";
type Kind = "bug" | "idea" | "praise" | "other";

type Row = {
  id: number;
  user_id: string | null;
  user_email: string | null;
  user_role: string | null;
  kind: Kind;
  message: string;
  page: string | null;
  user_agent: string | null;
  status: Status;
  created_at: string;
};

const STATUS_BADGE: Record<Status, "s1-soft" | "bronze-soft" | "default" | "positive" | "s3-soft"> = {
  new: "s1-soft",
  triaged: "bronze-soft",
  in_progress: "default",
  done: "positive",
  wontfix: "s3-soft",
};

const KIND_ICON: Record<Kind, string> = {
  bug: "🐛",
  idea: "💡",
  praise: "🎉",
  other: "💬",
};

const ALL_STATUSES: Status[] = ["new", "triaged", "in_progress", "done", "wontfix"];

export default async function FeedbackPage({ searchParams }: { searchParams: { status?: Status; kind?: Kind } }) {
  const sb = createClient();

  let q = sb.from("feedback").select("*").order("created_at", { ascending: false }).limit(200);
  if (searchParams.status) q = q.eq("status", searchParams.status);
  if (searchParams.kind) q = q.eq("kind", searchParams.kind);
  const { data, error } = await q;
  if (error) {
    return <div className="container mx-auto px-6 py-10 text-sm text-severity-1">Feedback query failed: {error.message}</div>;
  }
  const rows = (data ?? []) as Row[];

  // Per-status counts for the filter chips
  const { data: allCounts } = await sb.from("feedback").select("status, kind").limit(1000);
  const statusCounts: Record<Status, number> = { new: 0, triaged: 0, in_progress: 0, done: 0, wontfix: 0 };
  const kindCounts: Record<Kind, number> = { bug: 0, idea: 0, praise: 0, other: 0 };
  for (const r of allCounts ?? []) {
    statusCounts[r.status as Status] = (statusCounts[r.status as Status] ?? 0) + 1;
    kindCounts[r.kind as Kind] = (kindCounts[r.kind as Kind] ?? 0) + 1;
  }

  return (
    <div className="container mx-auto max-w-5xl px-6 py-8">
      <div>
        <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-bronze">Superadmin</div>
        <h1 className="mt-2 font-serif text-3xl font-bold text-navy">Feedback queue</h1>
        <p className="mt-1 text-sm text-muted">
          Bug reports, ideas, and praise from every user. Comes in via the floating Feedback button on any signed-in page.
        </p>
      </div>

      {/* Status filter row */}
      <div className="mt-6 flex flex-wrap gap-2">
        <Chip href="/super/feedback" label="All" count={Object.values(statusCounts).reduce((a, b) => a + b, 0)} active={!searchParams.status && !searchParams.kind} />
        {ALL_STATUSES.map((s) => (
          <Chip key={s} href={`/super/feedback?status=${s}`} label={s.replace("_", " ")} count={statusCounts[s] ?? 0} active={searchParams.status === s} />
        ))}
        <span className="mx-2 text-muted">·</span>
        {(Object.keys(kindCounts) as Kind[]).map((k) => (
          <Chip key={k} href={`/super/feedback?kind=${k}`} label={`${KIND_ICON[k]} ${k}`} count={kindCounts[k] ?? 0} active={searchParams.kind === k} />
        ))}
      </div>

      <div className="mt-6 space-y-3">
        {rows.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted">
              No feedback in this filter yet.
            </CardContent>
          </Card>
        )}
        {rows.map((r) => (
          <Card key={r.id}>
            <CardContent className="py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-base leading-none">{KIND_ICON[r.kind]}</span>
                    <Badge variant={STATUS_BADGE[r.status]}>{r.status.replace("_", " ")}</Badge>
                    <span className="text-[10px] uppercase tracking-wider text-muted">{r.kind}</span>
                    <span className="ml-auto text-[10px] text-muted">
                      {formatDistanceToNowStrict(new Date(r.created_at))} ago
                    </span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground">{r.message}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
                    <span>
                      <span className="font-medium text-navy">{r.user_email ?? "anonymous"}</span>
                      {r.user_role && <span> · {r.user_role}</span>}
                    </span>
                    {r.page && <span className="font-mono">on {r.page}</span>}
                  </div>
                </div>
              </div>
              <div className="mt-3 border-t border-border pt-3">
                <StatusButtons id={r.id} current={r.status} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Chip({ href, label, count, active }: { href: string; label: string; count: number; active: boolean }) {
  return (
    <a
      href={href}
      className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium capitalize ${
        active ? "border-bronze bg-bronze-soft text-bronze-dark" : "border-border bg-white text-muted hover:bg-surface-2"
      }`}
    >
      {label}
      <span className={`rounded-full px-1.5 text-[10px] ${active ? "bg-bronze text-white" : "bg-surface-2 text-muted"}`}>{count}</span>
    </a>
  );
}
