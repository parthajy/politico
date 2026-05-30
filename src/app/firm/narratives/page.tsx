import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNowStrict } from "date-fns";
import { NarrativesClient } from "./narratives-client";

export const dynamic = "force-dynamic";

type Tier = "urgent" | "forming" | "established" | "decaying" | "dormant";

type StoredNarrative = {
  id: number;
  label: string;
  summary: string;
  sentiment_lean: "hostile" | "mixed" | "supportive";
  trajectory: "rising" | "steady" | "fading";
  tier: Tier;
  status: "active" | "archived";
  recommended_response: string | null;
  first_seen_at: string;
  last_updated_at: string;
  last_event_at: string | null;
  event_count: number;
  peak_snt: number | null;
};

const TIER_ORDER: Record<Tier, number> = { urgent: 0, forming: 1, established: 2, decaying: 3, dormant: 4 };

const TIER_BADGE: Record<Tier, { variant: "s1-soft" | "s2-soft" | "bronze-soft" | "default" | "s3-soft"; icon: string }> = {
  urgent:      { variant: "s1-soft",     icon: "🔴" },
  forming:     { variant: "s2-soft",     icon: "🟠" },
  established: { variant: "bronze-soft", icon: "🟡" },
  decaying:    { variant: "default",     icon: "⚪" },
  dormant:     { variant: "s3-soft",     icon: "⚫" },
};

const SENTIMENT_BADGE: Record<string, "negative" | "default" | "positive"> = {
  hostile: "negative",
  mixed: "default",
  supportive: "positive",
};

export default async function NarrativesPage({ searchParams }: { searchParams: { tier?: Tier } }) {
  const sb = createClient();

  let q = sb
    .from("narratives")
    .select("*")
    .eq("status", "active")
    .order("tier", { ascending: true })
    .order("last_updated_at", { ascending: false });
  if (searchParams.tier) q = q.eq("tier", searchParams.tier);
  const { data: rows } = await q;
  const narratives = ((rows ?? []) as StoredNarrative[])
    .sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier]);

  // Count by tier for the filter chips
  const { data: allActive } = await sb.from("narratives").select("tier").eq("status", "active");
  const tierCounts: Record<Tier, number> = { urgent: 0, forming: 0, established: 0, decaying: 0, dormant: 0 };
  for (const r of allActive ?? []) tierCounts[r.tier as Tier] = (tierCounts[r.tier as Tier] ?? 0) + 1;

  return (
    <div className="container mx-auto max-w-6xl px-6 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-bronze">Narratives</div>
          <h1 className="mt-2 font-serif text-3xl font-bold text-navy">Emerging storylines</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Clusters that the AI desk is tracking over time. Each generation EVOLVES existing narratives —
            so &quot;Hydropower vs land rights&quot; becomes one storyline you watch maturing, not a new line every refresh.
            Tier auto-classifies by recent activity + sentiment + peak intensity.
          </p>
        </div>
        <NarrativesClient />
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <TierChip tier={null} count={Object.values(tierCounts).reduce((a, b) => a + b, 0)} active={!searchParams.tier} />
        {(Object.keys(TIER_BADGE) as Tier[]).map((t) => (
          <TierChip key={t} tier={t} count={tierCounts[t] ?? 0} active={searchParams.tier === t} />
        ))}
      </div>

      <div className="mt-6 space-y-4">
        {narratives.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted">
              No narratives in this tier yet.
              <br />
              <span className="text-xs">Use &quot;Regenerate&quot; in the top-right to run detection over the last 7 days.</span>
            </CardContent>
          </Card>
        )}

        {narratives.map((n) => {
          const tierStyle = TIER_BADGE[n.tier];
          return (
            <Card key={n.id} className={n.tier === "urgent" ? "border-severity-1/40" : ""}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant={tierStyle.variant}>{tierStyle.icon} {n.tier.toUpperCase()}</Badge>
                      <Badge variant={SENTIMENT_BADGE[n.sentiment_lean] ?? "default"}>{n.sentiment_lean}</Badge>
                      <Badge variant="default">{n.trajectory}</Badge>
                    </div>
                    <CardTitle className="mt-2 text-lg">{n.label}</CardTitle>
                    <CardDescription className="mt-2 text-sm leading-relaxed">{n.summary}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {n.recommended_response && (
                  <div className="rounded-lg border-l-2 border-bronze bg-bronze-soft/40 p-3">
                    <div className="text-[10px] font-medium uppercase tracking-wider text-bronze-dark">Recommended response</div>
                    <p className="mt-1 text-sm text-foreground/85">{n.recommended_response}</p>
                  </div>
                )}
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Stat label="Events" value={n.event_count.toString()} />
                  <Stat label="Peak SNT" value={n.peak_snt != null ? n.peak_snt.toFixed(2) : "—"} />
                  <Stat label="First seen" value={formatDistanceToNowStrict(new Date(n.first_seen_at)) + " ago"} />
                  <Stat label="Last update" value={formatDistanceToNowStrict(new Date(n.last_updated_at)) + " ago"} />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function TierChip({ tier, count, active }: { tier: Tier | null; count: number; active: boolean }) {
  const href = tier ? `/firm/narratives?tier=${tier}` : `/firm/narratives`;
  const label = tier ? `${TIER_BADGE[tier].icon} ${tier}` : "All";
  return (
    <a
      href={href}
      className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
        active ? "border-bronze bg-bronze-soft text-bronze-dark" : "border-border bg-white text-muted hover:bg-surface-2"
      }`}
    >
      <span className="capitalize">{label}</span>
      <span className={`rounded-full px-1.5 text-[10px] ${active ? "bg-bronze text-white" : "bg-surface-2 text-muted"}`}>{count}</span>
    </a>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2/40 p-2">
      <div className="text-[9px] uppercase tracking-wider text-muted">{label}</div>
      <div className="mt-0.5 text-sm font-medium text-navy">{value}</div>
    </div>
  );
}
