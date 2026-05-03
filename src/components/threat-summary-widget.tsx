import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export async function ThreatSummaryWidget() {
  const sb = createClient();
  const { data } = await sb.from("threat_assessments_summary").select("scope_type, scope_id, entity_name, threat_band, headline").order("generated_at", { ascending: false });
  const rows = (data ?? []).slice().sort((a, b) => (ORDER[a.threat_band] ?? 9) - (ORDER[b.threat_band] ?? 9));
  const top = rows.slice(0, 4);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Threat radar</CardTitle>
          <Link href="/party/threats" className="text-xs text-bronze underline">View all</Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {top.length === 0 && <div className="text-xs text-muted">No assessments published yet.</div>}
        {top.map((t) => (
          <div key={`${t.scope_type}:${t.scope_id ?? "_"}`} className="border-l-2 pl-3"
               style={{ borderColor: t.threat_band === "critical" || t.threat_band === "high" ? "var(--severity-1)" : t.threat_band === "medium" ? "var(--bronze)" : "var(--muted)" }}>
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-medium text-navy">{t.entity_name}</div>
              <Badge variant={t.threat_band === "critical" || t.threat_band === "high" ? "s1" : t.threat_band === "medium" ? "s2" : "s3"}>
                {t.threat_band.toUpperCase()}
              </Badge>
            </div>
            <p className="mt-0.5 line-clamp-2 text-[11px] text-foreground/80">{t.headline}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
