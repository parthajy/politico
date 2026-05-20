import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTooltip } from "@/components/info-tooltip";
import { subDays } from "date-fns";

// Topic momentum — count topic-tag mentions this week vs prior week,
// surface the top 6 by momentum (delta).

export async function TopicMomentumWidget() {
  const sb = createClient();
  const since7 = subDays(new Date(), 7).toISOString();
  const since14 = subDays(new Date(), 14).toISOString();

  const [thisRes, priorRes] = await Promise.all([
    sb.from("classifications").select("topic_tags").gte("classified_at", since7),
    sb.from("classifications").select("topic_tags").gte("classified_at", since14).lt("classified_at", since7),
  ]);

  const countThis = countTags(thisRes.data ?? []);
  const countPrior = countTags(priorRes.data ?? []);

  // Combine all tags and compute delta
  const all = new Set([...countThis.keys(), ...countPrior.keys()]);
  const rows = Array.from(all).map((tag) => {
    const t = countThis.get(tag) ?? 0;
    const p = countPrior.get(tag) ?? 0;
    return { tag, this: t, prior: p, delta: t - p };
  })
    .filter((r) => r.this >= 2 || r.prior >= 2) // ignore noise
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 6);

  const maxThis = Math.max(1, ...rows.map((r) => r.this));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center">
          <CardTitle>Topic momentum</CardTitle>
          <InfoTooltip text="Top 6 topics by week-over-week change in signal volume. Up arrow = gaining attention, down = fading. Bar shows this week's count relative to the busiest topic." />
        </div>
        <p className="mt-0.5 text-xs text-muted">Last 7 days vs the 7 before.</p>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted">Not enough data yet.</div>
        ) : (
          <ul className="space-y-2.5">
            {rows.map((r) => {
              const pct = Math.max(4, Math.round((r.this / maxThis) * 100));
              const rising = r.delta > 0;
              const flat = r.delta === 0;
              return (
                <li key={r.tag}>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="line-clamp-1 text-foreground">{r.tag}</span>
                    <span className={`tabular-nums ${flat ? "text-muted" : rising ? "text-positive" : "text-severity-1"}`}>
                      {rising ? "↑" : flat ? "→" : "↓"} {r.delta >= 0 ? "+" : ""}{r.delta}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-sand-deep">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: rising ? "var(--positive)" : flat ? "var(--muted)" : "var(--severity-1)" }} />
                  </div>
                  <div className="mt-0.5 flex justify-between text-[10px] text-muted tabular-nums">
                    <span>{r.this} this week</span>
                    <span>{r.prior} prior</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function countTags(rows: { topic_tags: string[] | null }[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) for (const t of r.topic_tags ?? []) m.set(t, (m.get(t) ?? 0) + 1);
  return m;
}
