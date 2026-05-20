import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { InfoTooltip } from "@/components/info-tooltip";
import { subDays, subHours } from "date-fns";

// Bloomberg-ish hero strip across the top of /party.
// Four numbers with period-over-period deltas. Animated entrance.

export async function HeroStatsStrip() {
  const sb = createClient();

  const now = new Date();
  const since24h = subHours(now, 24).toISOString();
  const since48h = subHours(now, 48).toISOString();
  const since7d = subDays(now, 7).toISOString();
  const since14d = subDays(now, 14).toISOString();

  const [
    { count: signals24 },
    { count: signals48 },
    { count: alertsActive },
    { data: stateTrend },
    { data: threats },
  ] = await Promise.all([
    sb.from("events").select("id", { count: "exact", head: true }).gte("ingested_at", since24h),
    sb.from("events").select("id", { count: "exact", head: true }).gte("ingested_at", since48h),
    sb.from("alerts").select("id", { count: "exact", head: true }).is("resolved_at", null).in("severity", ["s1", "s2"]),
    sb.from("sentiment_snapshots").select("date, net_sentiment").eq("scope_type", "state").order("date", { ascending: false }).limit(8),
    sb.from("threat_assessments_summary").select("threat_band").in("threat_band", ["high", "critical"]),
  ]);

  const signalsLast24 = signals24 ?? 0;
  const signalsPrior24 = Math.max(0, (signals48 ?? 0) - signalsLast24);
  const signalsDelta = signalsLast24 - signalsPrior24;

  const trend = (stateTrend ?? []).map((s) => Number(s.net_sentiment));
  const moodToday = trend[0] ?? 0;
  const moodWeekAgo = trend[6] ?? trend[trend.length - 1] ?? 0;
  const moodDelta = moodToday - moodWeekAgo;

  const cabinetAtThreat = (threats ?? []).length;

  // Story velocity (this week vs prior week)
  const [{ count: storiesThisWeek }, { count: storiesPriorWeek }] = await Promise.all([
    sb.from("stories").select("id", { count: "exact", head: true }).eq("status", "published").gte("published_at", since7d),
    sb.from("stories").select("id", { count: "exact", head: true }).eq("status", "published").gte("published_at", since14d).lt("published_at", since7d),
  ]);
  const storyDelta = (storiesThisWeek ?? 0) - (storiesPriorWeek ?? 0);

  return (
    <div className="animate-rise mt-6 grid gap-3 md:grid-cols-2 lg:grid-cols-5">
      <Stat
        label="Signals · 24h"
        value={signalsLast24.toLocaleString()}
        delta={signalsDelta}
        deltaLabel={`${signalsDelta >= 0 ? "+" : ""}${signalsDelta} vs prior 24h`}
        deltaGood={signalsDelta >= 0}
        tooltip="Total events ingested in the last 24 hours, compared to the 24 hours before that."
        live
      />
      <Stat
        label="Active alerts"
        value={(alertsActive ?? 0).toString()}
        sub="S1 + S2 · unresolved"
        warn={(alertsActive ?? 0) >= 5}
        tooltip="S1 (critical) and S2 (watch) alerts that haven't been resolved yet. Anything red here demands attention."
      />
      <Stat
        label="State mood"
        value={`${moodToday >= 0 ? "+" : ""}${moodToday.toFixed(2)}`}
        delta={moodDelta}
        deltaLabel={`Δ 7d: ${moodDelta >= 0 ? "+" : ""}${moodDelta.toFixed(2)}`}
        deltaGood={moodDelta >= 0}
        tooltip="Net sentiment of all signals tagged to Arunachal Pradesh. −1.0 hostile, 0 neutral, +1.0 supportive. Compared to a week ago."
      />
      <Stat
        label="Cabinet at threat"
        value={cabinetAtThreat.toString()}
        sub="High or Critical band"
        warn={cabinetAtThreat >= 3}
        tooltip="Number of cabinet members (including CM) flagged high or critical on the threat radar. Hover the cards on /party/cabinet to see who."
      />
      <Stat
        label="Stories · 7d"
        value={(storiesThisWeek ?? 0).toString()}
        delta={storyDelta}
        deltaLabel={`${storyDelta >= 0 ? "+" : ""}${storyDelta} vs prior 7d`}
        deltaGood={storyDelta >= 0}
        tooltip="Stories published this week by the firm, compared to last week."
      />
    </div>
  );
}

function Stat({
  label, value, sub, delta, deltaLabel, deltaGood = true, tooltip, live = false, warn = false,
}: {
  label: string; value: string; sub?: string; delta?: number; deltaLabel?: string;
  deltaGood?: boolean; tooltip?: string; live?: boolean; warn?: boolean;
}) {
  return (
    <Card className={`relative overflow-hidden p-4 transition hover:shadow-sm ${warn ? "border-severity-1/40" : ""}`}>
      {live && (
        <span className="absolute right-3 top-3 flex items-center gap-1 text-[9px] font-medium uppercase tracking-wider text-positive">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-positive opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-positive" />
          </span>
          live
        </span>
      )}
      <div className="flex items-center text-[10px] uppercase tracking-wider text-muted">
        {label}
        {tooltip && <InfoTooltip text={tooltip} />}
      </div>
      <div className={`numeric-callout mt-1 text-3xl ${warn ? "text-severity-1" : "text-navy"}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[10px] text-muted">{sub}</div>}
      {delta !== undefined && deltaLabel && (
        <div className={`mt-1 text-[11px] ${delta === 0 ? "text-muted" : (delta > 0) === deltaGood ? "text-positive" : "text-severity-1"}`}>
          {delta > 0 && "↑ "}{delta < 0 && "↓ "}{deltaLabel}
        </div>
      )}
    </Card>
  );
}
