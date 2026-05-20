import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RefreshButton } from "./refresh-button";
import { PremiumCard } from "./premium-card";
import { formatDistanceToNowStrict } from "date-fns";

export const dynamic = "force-dynamic";

const LIVE_SOURCES = [
  { id: "reddit", label: "Reddit", desc: "r/arunachalpradesh, r/northeastindia, r/india, r/IndiaSpeaks", cadence: "hourly cron + on-demand" },
  { id: "youtube", label: "YouTube Data API v3", desc: "Search queries: AP + CM. Free quota 10K units/day.", cadence: "hourly cron + on-demand" },
  { id: "gdelt", label: "GDELT 2.0", desc: "India + AP keyword filter, datedesc.", cadence: "hourly cron + on-demand" },
  { id: "google_news", label: "Google News RSS", desc: "Per-district + per-minister + per-issue queries.", cadence: "hourly cron + on-demand" },
  { id: "rss", label: "Indian outlet RSS", desc: "The Hindu, Indian Express, Hindustan Times, NDTV, Arunachal Times, Echo of Arunachal, Arunachal Front.", cadence: "hourly cron + on-demand" },
] as const;

const PREMIUM_SOURCES = [
  { name: "Meltwater", desc: "Primary social + media listening at enterprise scale.", unlocks: "5–10× monitoring volume; sentiment-quality lift; campaign-grade alerting." },
  { name: "Cision India", desc: "Print monitoring across English + Indian-language dailies.", unlocks: "Full-text print clippings, page-level placement, AVE estimation." },
  { name: "TAM Media", desc: "Broadcast TV monitoring with primetime tracking.", unlocks: "Channel-level reach, prime/non-prime split, regional-language coverage." },
  { name: "Konnect Insights", desc: "Regional + Hindi social depth tuned for Indian languages.", unlocks: "Native-language NLP, vernacular sentiment, regional-influencer mapping." },
  { name: "Maltego", desc: "OSINT graph workbench for entity relationship mapping.", unlocks: "Network graphs, identity resolution, multi-source pivots." },
] as const;
// Note: /firm/sources is analyst-facing — the "post-contract" framing is fine here.
// CMO-facing pages live under /party/* and avoid all firm-side commercial language.

async function loadHealth() {
  const sb = createClient();
  const sinceMidnight = new Date();
  sinceMidnight.setHours(0, 0, 0, 0);

  const results = await Promise.all(
    LIVE_SOURCES.map(async (s) => {
      const [{ data: latest }, { count: today }, { count: total }] = await Promise.all([
        sb.from("events").select("ingested_at").eq("source", s.id).order("ingested_at", { ascending: false }).limit(1).maybeSingle(),
        sb.from("events").select("id", { count: "exact", head: true }).eq("source", s.id).gte("ingested_at", sinceMidnight.toISOString()),
        sb.from("events").select("id", { count: "exact", head: true }).eq("source", s.id),
      ]);
      return {
        ...s,
        last_ingested: latest?.ingested_at as string | null | undefined,
        events_today: today ?? 0,
        events_total: total ?? 0,
      };
    })
  );
  return results;
}

export default async function SourcesPage() {
  const health = await loadHealth();

  return (
    <div className="container mx-auto max-w-7xl px-6 py-10">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-bronze">Sources</div>
          <h1 className="mt-2 font-serif text-3xl font-bold text-navy">Signal pipeline health</h1>
          <p className="mt-2 text-sm text-muted">Five live sources powering the demo. Five enterprise sources unlock post-contract.</p>
        </div>
        <RefreshButton />
      </div>

      <h2 className="mt-10 font-serif text-lg font-bold text-navy">Live</h2>
      <div className="mt-3 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {health.map((s) => {
          const lastIngested = s.last_ingested ? new Date(s.last_ingested) : null;
          const ageHours = lastIngested ? (Date.now() - lastIngested.getTime()) / 3_600_000 : Infinity;
          // Cron runs daily; on-demand Refresh fills in between. So "Idle" up to
          // a week is normal, not a fault. Only flag red after a genuine gap.
          const status = !lastIngested ? "Pending"
            : ageHours <= 6 ? "Live"
            : ageHours <= 48 ? "Recent"
            : ageHours <= 24 * 7 ? "Idle"
            : "Stale";
          const statusVariant = status === "Live" ? "positive"
            : status === "Recent" ? "default"
            : status === "Idle" ? "outline"
            : status === "Stale" ? "negative"
            : "outline";
          return (
            <Card key={s.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle>{s.label}</CardTitle>
                  <Badge variant={statusVariant}>{status}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted">{s.desc}</p>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-xs uppercase tracking-wider text-muted">Today</div>
                    <div className="numeric-callout text-2xl text-navy">{s.events_today}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wider text-muted">All time</div>
                    <div className="numeric-callout text-2xl text-navy">{s.events_total}</div>
                  </div>
                </div>
                <div className="mt-4 text-xs text-muted">
                  {lastIngested
                    ? `Last sync ${formatDistanceToNowStrict(lastIngested)} ago`
                    : "No sync yet"}
                </div>
                <div className="mt-1 text-xs text-muted">{s.cadence}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <h2 className="mt-12 font-serif text-lg font-bold text-navy">Available — not connected</h2>
      <p className="mt-1 text-sm text-muted">Premium sources the firm will purchase post-contract. Click any card to see what it unlocks.</p>
      <div className="mt-3 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {PREMIUM_SOURCES.map((p) => (
          <PremiumCard key={p.name} name={p.name} desc={p.desc} unlocks={p.unlocks} />
        ))}
      </div>
    </div>
  );
}
