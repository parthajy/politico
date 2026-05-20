import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SourceMixChart } from "./source-mix-chart";
import { subHours } from "date-fns";

const COLORS: Record<string, string> = {
  reddit:      "#FF5700",
  youtube:     "#FF0000",
  gdelt:       "#1F4287",
  google_news: "#4285F4",
  rss:         "#0F2942",
  manual:      "#C7944C",
};

const LABELS: Record<string, string> = {
  reddit: "Reddit", youtube: "YouTube", gdelt: "GDELT", google_news: "Google News", rss: "Indian outlets", manual: "Manual",
};

export async function SourceMixWidget() {
  const sb = createClient();
  const since = subHours(new Date(), 24).toISOString();

  // Aggregate ingested events by source in last 24h
  const { data } = await sb.from("events").select("source").gte("ingested_at", since);

  const counts = new Map<string, number>();
  for (const e of data ?? []) counts.set(e.source, (counts.get(e.source) ?? 0) + 1);
  const total = Array.from(counts.values()).reduce((a, b) => a + b, 0);

  const slices = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([src, count]) => ({
      name: LABELS[src] ?? src,
      value: count,
      color: COLORS[src] ?? "#6B7280",
      pct: total > 0 ? Math.round((count / total) * 100) : 0,
    }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Source mix · 24h</CardTitle>
        <p className="mt-0.5 text-xs text-muted">Where today&apos;s {total.toLocaleString()} signals came from.</p>
      </CardHeader>
      <CardContent>
        {slices.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted">No signals in the last 24h.</div>
        ) : (
          <SourceMixChart slices={slices} />
        )}
      </CardContent>
    </Card>
  );
}
