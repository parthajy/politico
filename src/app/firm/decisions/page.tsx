import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RecordDecisionButton } from "./record-button";
import { format } from "date-fns";

export const dynamic = "force-dynamic";

type DecisionRow = {
  id: string;
  title: string;
  summary: string | null;
  kind: string;
  decided_on: string;
  decided_by_role: string | null;
  scope_type: string | null;
  scope_id: number | null;
  triggering_event_ids: string[];
  outcome: string | null;
  created_at: string;
  recorded_by: string | null;
  users: { full_name: string | null; email: string } | null;
};

const KIND_LABELS: Record<string, string> = {
  policy_change: "Policy change",
  public_statement: "Public statement",
  cabinet_decision: "Cabinet decision",
  minister_directive: "Minister directive",
  investigation: "Investigation",
  visit: "Visit",
  communication_freeze: "Communication freeze",
  other: "Other",
};

export default async function DecisionsPage() {
  const sb = createClient();
  const { data } = await sb
    .from("decisions")
    .select("id, title, summary, kind, decided_on, decided_by_role, scope_type, scope_id, triggering_event_ids, outcome, created_at, recorded_by, users(full_name, email)")
    .order("decided_on", { ascending: false })
    .limit(50);

  const rows = (data ?? []) as unknown as DecisionRow[];

  // Pull anchor signal titles for any referenced events in one go
  const allEventIds = Array.from(new Set(rows.flatMap((r) => r.triggering_event_ids ?? [])));
  const eventById = new Map<string, { title: string }>();
  if (allEventIds.length > 0) {
    const { data: evs } = await sb.from("events").select("id, title").in("id", allEventIds);
    for (const e of evs ?? []) eventById.set(e.id, { title: e.title });
  }

  return (
    <div className="container mx-auto max-w-5xl px-6 py-10">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-bronze">Decision history</div>
          <h1 className="mt-2 font-serif text-3xl font-bold text-navy">What was decided, and why</h1>
          <p className="mt-1 text-sm text-muted">
            Every cabinet decision with the signals that triggered it. Institutional memory the consultancy carries across personnel changes — the &ldquo;why hire us&rdquo; record.
          </p>
        </div>
        <RecordDecisionButton />
      </div>

      {rows.length === 0 && (
        <Card className="mt-6">
          <CardContent className="py-12 text-center text-sm text-muted">
            No decisions recorded yet. Click <span className="font-medium text-navy">Record decision</span> above to log the first one.
          </CardContent>
        </Card>
      )}

      <div className="mt-6 space-y-4">
        {rows.map((d) => {
          const u = d.users;
          const triggers = (d.triggering_event_ids ?? []).map((id) => eventById.get(id)?.title).filter(Boolean) as string[];
          return (
            <Card key={d.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle>{d.title}</CardTitle>
                    <CardDescription className="mt-1">
                      {format(new Date(d.decided_on), "EEE d MMM yyyy")}
                      {d.decided_by_role && <> · {d.decided_by_role}</>}
                    </CardDescription>
                  </div>
                  <Badge variant="navy">{KIND_LABELS[d.kind] ?? d.kind}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                {d.summary && <p className="text-sm text-foreground/85">{d.summary}</p>}

                {triggers.length > 0 && (
                  <div className="mt-4">
                    <div className="text-[10px] uppercase tracking-wider text-muted">Triggered by {triggers.length} signal{triggers.length === 1 ? "" : "s"}</div>
                    <ul className="mt-1 space-y-1 text-xs text-muted">
                      {triggers.slice(0, 4).map((t, i) => (
                        <li key={i} className="line-clamp-1">· {t}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {d.outcome && (
                  <div className="mt-4 rounded border-l-2 border-positive bg-sand/40 p-3">
                    <div className="text-[10px] uppercase tracking-wider text-muted">Observed outcome</div>
                    <p className="mt-1 text-xs">{d.outcome}</p>
                  </div>
                )}

                <div className="mt-3 text-[10px] text-muted">
                  Recorded by {u?.full_name ?? u?.email ?? "—"}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
