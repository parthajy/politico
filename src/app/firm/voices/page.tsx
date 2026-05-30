import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { InfoTooltip } from "@/components/info-tooltip";
import { format, formatDistanceToNowStrict } from "date-fns";
import { VoicesFilter } from "./voices-filter";
import { AddVoiceButton } from "./voice-form";

export const dynamic = "force-dynamic";

type SearchParams = {
  district?: string;
  active?: string;
  review?: string;       // "1" = auto-extracted + unknown relationship (review queue)
  profession?: string;
  rel?: string;          // warm | cool | hostile | unknown
};

type VoiceRow = {
  id: string; name: string; role: string | null; district_id: number | null;
  active: boolean; joined_at: string | null; last_engagement_at: string | null;
  ever_paid: boolean; ever_scripted: boolean;
  social_handles: Record<string, string> | null;
  coverage_topics: string[] | null;
  reach_estimate: number | null;
  response_rate: number | null;
  placement_count: number | null;
  last_outreach_at: string | null;
  outlet_name: string | null;
  relationship_status: "warm" | "cool" | "hostile" | "unknown" | null;
  auto_extracted: boolean | null;
  profession_category: string | null;
  confidence_score: number | null;
  why_they_matter: string | null;
  last_seen_at: string | null;
  source_event_id: string | null;
  districts: { name: string } | null;
};

export default async function VoicesPage({ searchParams }: { searchParams: SearchParams }) {
  const sb = createClient();

  let query = sb
    .from("voices")
    .select(`
      id, name, role, district_id, active, joined_at, last_engagement_at,
      ever_paid, ever_scripted, social_handles, coverage_topics,
      reach_estimate, response_rate, placement_count, last_outreach_at,
      outlet_name, relationship_status, auto_extracted, profession_category,
      confidence_score, why_they_matter, last_seen_at, source_event_id,
      districts(name)
    `)
    .order("placement_count", { ascending: false, nullsFirst: false })
    .order("last_seen_at", { ascending: false, nullsFirst: false })
    .order("reach_estimate", { ascending: false, nullsFirst: false });

  if (searchParams.district) query = query.eq("district_id", parseInt(searchParams.district, 10));
  if (searchParams.active === "1") query = query.eq("active", true);
  if (searchParams.active === "0") query = query.eq("active", false);
  if (searchParams.profession) query = query.eq("profession_category", searchParams.profession);
  if (searchParams.rel) query = query.eq("relationship_status", searchParams.rel);
  if (searchParams.review === "1") {
    // Auto-extracted voices that haven't been triaged by an analyst yet
    query = query.eq("auto_extracted", true).eq("relationship_status", "unknown");
  }

  const { data: voices, error } = await query;
  if (error) {
    return <div className="container mx-auto px-6 py-10 text-sm text-severity-1">Voices query failed: {error.message}</div>;
  }
  const rows = (voices ?? []) as unknown as VoiceRow[];
  const { data: districts } = await sb.from("districts").select("id, name").order("name");

  // Review-queue count for the chip badge (regardless of current filter)
  const { count: reviewQueueCount } = await sb
    .from("voices")
    .select("id", { count: "exact", head: true })
    .eq("auto_extracted", true)
    .eq("relationship_status", "unknown")
    .eq("active", true);

  // Doctrine 4 stats + reach/placement aggregates
  const total = rows.length;
  const active = rows.filter((v) => v.active).length;
  const everPaid = rows.filter((v) => v.ever_paid).length;
  const everScripted = rows.filter((v) => v.ever_scripted).length;
  const totalReach = rows.reduce((acc, v) => acc + (v.reach_estimate ?? 0), 0);
  const totalPlacements = rows.reduce((acc, v) => acc + (v.placement_count ?? 0), 0);

  return (
    <div className="container mx-auto max-w-7xl px-6 py-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-bronze">Voices CRM</div>
          <h1 className="mt-2 font-serif text-3xl font-bold text-navy">Local voices</h1>
          <p className="mt-1 text-sm text-muted">Leverage map, not a contact list. Doctrine 3 (Local Voice First) + Doctrine 4 (No Paid Narrative).</p>
        </div>
        <AddVoiceButton districts={districts ?? []} />
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        <Stat label="Active" value={active.toString()} sub={`of ${total}`} />
        <Stat label="Combined reach" value={`${Math.round(totalReach / 1000)}k`} sub="across owned channels" />
        <Stat label="Placements (lifetime)" value={totalPlacements.toString()} sub="stories anchored via these voices" />
        <Stat label="Avg response rate" value={`${Math.round(rows.filter((v) => v.response_rate != null).reduce((a, v) => a + (v.response_rate ?? 0), 0) / Math.max(1, rows.filter((v) => v.response_rate != null).length) * 100)}%`} sub="to firm outreach" />
        <Stat label="Ever paid" value={everPaid.toString()} highlight={everPaid === 0} sub="Doctrine 4" />
        <Stat label="Ever scripted" value={everScripted.toString()} highlight={everScripted === 0} sub="Doctrine 4" />
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Voices · sorted by placement count + reach</CardTitle>
          <CardDescription>Filter by district or status. Click a name to see relationship notes (firm-only).</CardDescription>
        </CardHeader>
        <CardContent>
          <VoicesFilter
            districts={districts ?? []}
            initial={searchParams}
            reviewQueueCount={reviewQueueCount ?? 0}
          />
          <div className="mt-4 overflow-x-auto">
            <div className="min-w-[1100px] overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-sand text-xs uppercase tracking-wider text-muted">
                  <tr>
                    <th className="px-3 py-2 text-left">Name</th>
                    <th className="px-3 py-2 text-left">Role · District</th>
                    <th className="px-3 py-2 text-left">Topics<InfoTooltip text="Issue areas this voice has credibility on. Used by the AI when suggesting story anchors." /></th>
                    <th className="px-3 py-2 text-left">Reach<InfoTooltip text="Estimated audience reach via the voice's owned channels (followers + likely amplification). Approximate." /></th>
                    <th className="px-3 py-2 text-left">Resp %<InfoTooltip text="Share of firm outreach the voice responded to within 48h. Higher = more reliable as a fast-turnaround anchor." /></th>
                    <th className="px-3 py-2 text-left">Placements<InfoTooltip text="Lifetime count of stories the firm has successfully placed via this voice. Doctrine 5 (Visual Proof Over Claims)." /></th>
                    <th className="px-3 py-2 text-left">Last contact<InfoTooltip text="Most recent outreach (call, message, meeting). >90 days = at risk of going cold." /></th>
                    <th className="px-3 py-2 text-left">Channels</th>
                    <th className="px-3 py-2 text-left">Compliance<InfoTooltip text="Doctrine 4. ever_paid and ever_scripted must both stay 'no'. Visible to the cabinet." /></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((v) => {
                    const lastDays = v.last_outreach_at ? Math.floor((Date.now() - new Date(v.last_outreach_at).getTime()) / 86400_000) : null;
                    const cold = lastDays != null && lastDays > 90;
                    return (
                      <tr key={v.id} className="border-b border-border last:border-0 hover:bg-sand/40">
                        <td className="px-3 py-2 align-top">
                          <div className="flex items-center gap-2">
                            <div className="font-medium text-navy">{v.name}</div>
                            {v.auto_extracted && (
                              <span title={`Auto-extracted (confidence ${v.confidence_score?.toFixed(2) ?? "?"})`} className="rounded-full bg-bronze-soft px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider text-bronze-dark">
                                auto
                              </span>
                            )}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {v.relationship_status && (
                              <Badge variant={v.relationship_status === "warm" ? "positive" : v.relationship_status === "hostile" ? "s1-soft" : v.relationship_status === "cool" ? "bronze-soft" : "s3-soft"}>
                                {v.relationship_status === "warm" ? "🤝 warm" : v.relationship_status === "hostile" ? "⚠️ hostile" : v.relationship_status === "cool" ? "🌫️ cool" : "❓ unknown"}
                              </Badge>
                            )}
                            {v.profession_category && (
                              <Badge variant="default">{v.profession_category.replace("_", " ")}</Badge>
                            )}
                            <Badge variant={v.active ? "positive" : "outline"}>{v.active ? "active" : "dormant"}</Badge>
                          </div>
                          {v.why_they_matter && (
                            <p className="mt-1.5 max-w-md text-[11px] text-muted leading-snug line-clamp-2">{v.why_they_matter}</p>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs align-top">
                          <div className="text-foreground">{v.role ?? "—"}</div>
                          <div className="text-muted">{v.districts?.name ?? "—"}</div>
                          {v.outlet_name && <div className="text-[10px] text-bronze-dark mt-0.5">{v.outlet_name}</div>}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          <div className="flex flex-wrap gap-1">
                            {(v.coverage_topics ?? []).slice(0, 2).map((t) => (
                              <span key={t} className="rounded bg-sand-deep px-1.5 py-0.5 text-[10px] text-navy">{t}</span>
                            ))}
                            {(v.coverage_topics ?? []).length === 0 && <span className="text-muted">—</span>}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {v.reach_estimate != null ? (
                            <span className="numeric-callout text-navy">{(v.reach_estimate / 1000).toFixed(1)}k</span>
                          ) : <span className="text-muted">—</span>}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {v.response_rate != null ? (
                            <span className="numeric-callout text-navy">{Math.round(v.response_rate * 100)}%</span>
                          ) : <span className="text-muted">—</span>}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          <span className="numeric-callout text-navy">{v.placement_count ?? 0}</span>
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {v.last_outreach_at ? (
                            <span className={cold ? "text-severity-1" : "text-muted"} title={format(new Date(v.last_outreach_at), "d MMM yyyy")}>
                              {formatDistanceToNowStrict(new Date(v.last_outreach_at))} ago
                              {cold && " · cold"}
                            </span>
                          ) : <span className="text-muted">never</span>}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {v.social_handles && Object.keys(v.social_handles).length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {Object.entries(v.social_handles).map(([k, val]) => (
                                <span key={k} className="rounded bg-sand-deep px-1.5 py-0.5 text-[10px] text-muted" title={`${k}: ${val}`}>
                                  {k[0].toUpperCase()}
                                </span>
                              ))}
                            </div>
                          ) : <span className="text-muted">—</span>}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1">
                            <Badge variant={v.ever_paid ? "negative" : "positive"} title="Ever paid">{v.ever_paid ? "paid" : "unpaid"}</Badge>
                            <Badge variant={v.ever_scripted ? "negative" : "positive"} title="Ever scripted">{v.ever_scripted ? "scripted" : "unscripted"}</Badge>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, highlight, sub }: { label: string; value: string; highlight?: boolean; sub?: string }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="text-[10px] uppercase tracking-wider text-muted">{label}</div>
        <div className={`numeric-callout text-2xl ${highlight ? "text-positive" : "text-navy"}`}>{value}</div>
        {sub && <div className="mt-0.5 text-[10px] text-muted">{sub}</div>}
      </CardContent>
    </Card>
  );
}
