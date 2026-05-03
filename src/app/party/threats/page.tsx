import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNowStrict } from "date-fns";

export const dynamic = "force-dynamic";

type SummaryRow = {
  id: string;
  scope_type: "cm" | "minister" | "constituency";
  scope_id: number | null;
  entity_name: string;
  threat_band: "low" | "medium" | "high" | "critical";
  headline: string;
  generated_at: string;
};

const ORDER: Record<SummaryRow["threat_band"], number> = { critical: 0, high: 1, medium: 2, low: 3 };

export default async function PartyThreats() {
  const sb = createClient();
  const { data } = await sb
    .from("threat_assessments_summary")
    .select("*")
    .order("generated_at", { ascending: false });
  const rows = (data ?? []) as SummaryRow[];
  rows.sort((a, b) => ORDER[a.threat_band] - ORDER[b.threat_band]);

  const cm = rows.find((r) => r.scope_type === "cm");
  const ministers = rows.filter((r) => r.scope_type === "minister");
  const constituencies = rows.filter((r) => r.scope_type === "constituency");

  return (
    <div className="container mx-auto max-w-5xl px-6 py-10">
      <div className="text-xs uppercase tracking-[0.18em] text-bronze">Threat radar — summary</div>
      <h1 className="mt-2 font-serif text-3xl font-bold text-navy">What the firm is watching for you</h1>
      <p className="mt-1 text-sm text-muted">
        One-line summary per entity. The full assessment — specific threats, time horizons, and recommended actions — is held by the firm and discussed in your weekly principals meeting.
      </p>

      {rows.length === 0 && (
        <Card className="mt-6">
          <CardContent className="py-12 text-center text-sm text-muted">
            No assessments published yet. The firm is preparing the first round.
          </CardContent>
        </Card>
      )}

      {cm && (
        <section className="mt-8">
          <h2 className="mb-3 font-serif text-lg font-bold text-navy">Chief Minister</h2>
          <SummaryCard r={cm} />
        </section>
      )}

      {ministers.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 font-serif text-lg font-bold text-navy">Cabinet</h2>
          <div className="space-y-3">
            {ministers.map((r) => <SummaryCard key={r.id} r={r} />)}
          </div>
        </section>
      )}

      {constituencies.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 font-serif text-lg font-bold text-navy">Constituencies</h2>
          <div className="space-y-3">
            {constituencies.map((r) => <SummaryCard key={r.id} r={r} />)}
          </div>
        </section>
      )}
    </div>
  );
}

function SummaryCard({ r }: { r: SummaryRow }) {
  const bandColor = r.threat_band === "critical" || r.threat_band === "high" ? "var(--severity-1)" : r.threat_band === "medium" ? "var(--bronze)" : "var(--muted)";
  const variant = r.threat_band === "critical" ? "s1" : r.threat_band === "high" ? "s1" : r.threat_band === "medium" ? "s2" : "s3";
  const linkHref = r.scope_type === "constituency" && r.scope_id ? `/party/constituency/${r.scope_id}` : null;

  return (
    <Card className="border-l-4" style={{ borderLeftColor: bandColor }}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{r.entity_name}</CardTitle>
            <CardDescription className="mt-2 text-sm leading-relaxed text-foreground/85">{r.headline}</CardDescription>
          </div>
          <Badge variant={variant}>{r.threat_band.toUpperCase()}</Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-0 text-[10px] text-muted">
        Updated {formatDistanceToNowStrict(new Date(r.generated_at))} ago
        {linkHref && <> · <Link href={linkHref} className="text-bronze underline">Open seat</Link></>}
      </CardContent>
    </Card>
  );
}
