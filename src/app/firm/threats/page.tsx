import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GenerateAllButton } from "./generate-all-button";
import { formatDistanceToNowStrict } from "date-fns";

export const dynamic = "force-dynamic";

type ThreatRow = {
  id: string;
  scope_type: "cm" | "minister" | "constituency";
  scope_id: number | null;
  entity_name: string;
  threat_score: number;
  threat_band: "low" | "medium" | "high" | "critical";
  headline: string;
  threats: { title: string; description: string; time_horizon: string; severity: string }[];
  recommended_actions: { action: string; owner: string; urgency: string }[];
  evidence_event_ids: string[];
  generated_at: string;
  model_version: string | null;
};

export default async function ThreatsPage() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await sb.from("users").select("role").eq("id", user.id).single();

  if (profile?.role !== "firm_admin") {
    return (
      <div className="container mx-auto max-w-3xl px-6 py-10">
        <Card>
          <CardHeader>
            <CardTitle>Threat radar — admin only</CardTitle>
            <CardDescription>You are signed in as <span className="font-medium text-navy">{profile?.role ?? "—"}</span>. The threat radar is restricted to firm_admin accounts.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            Sign in as <span className="font-medium">firm.admin@signaldesk.demo</span> to access threat assessments. The CMO sees a curated summary on <Link href="/party/threats" className="text-bronze underline">/party/threats</Link>.
          </CardContent>
        </Card>
      </div>
    );
  }

  const { data: rows } = await sb
    .from("threat_assessments")
    .select("*")
    .order("threat_score", { ascending: false });

  const threats = (rows ?? []) as ThreatRow[];
  const cmRow = threats.find((t) => t.scope_type === "cm");
  const ministers = threats.filter((t) => t.scope_type === "minister");
  const constituencies = threats.filter((t) => t.scope_type === "constituency");

  return (
    <div className="container mx-auto max-w-7xl px-6 py-10">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-bronze">Threat radar · admin · gpt-4o</div>
          <h1 className="mt-2 font-serif text-3xl font-bold text-navy">Forward-looking risk</h1>
          <p className="mt-1 text-sm text-muted">
            Per-entity threat assessment with specific risks, time horizons, and recommended pre-emptive actions.
            CMO sees only the headline summary on <Link href="/party/threats" className="text-bronze underline">their threat view</Link>.
          </p>
        </div>
        <GenerateAllButton />
      </div>

      {threats.length === 0 && (
        <Card className="mt-6">
          <CardContent className="py-12 text-center text-sm text-muted">
            No threat assessments yet. Click <span className="font-medium text-navy">Generate all</span> to run gpt-4o across the CM, top 5 ministers, and top 5 constituencies.
          </CardContent>
        </Card>
      )}

      {cmRow && (
        <section className="mt-8">
          <h2 className="mb-3 font-serif text-lg font-bold text-navy">Chief Minister</h2>
          <ThreatCard t={cmRow} large />
        </section>
      )}

      {ministers.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 font-serif text-lg font-bold text-navy">Cabinet ministers</h2>
          <div className="grid gap-4 lg:grid-cols-2">
            {ministers.map((t) => <ThreatCard key={t.id} t={t} />)}
          </div>
        </section>
      )}

      {constituencies.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 font-serif text-lg font-bold text-navy">Constituencies</h2>
          <div className="grid gap-4 lg:grid-cols-2">
            {constituencies.map((t) => <ThreatCard key={t.id} t={t} />)}
          </div>
        </section>
      )}
    </div>
  );
}

function ThreatCard({ t, large = false }: { t: ThreatRow; large?: boolean }) {
  const bandColor = t.threat_band === "critical" ? "var(--severity-1)" : t.threat_band === "high" ? "var(--severity-1)" : t.threat_band === "medium" ? "var(--bronze)" : "var(--muted)";
  const bandVariant = t.threat_band === "critical" ? "s1" : t.threat_band === "high" ? "s1" : t.threat_band === "medium" ? "s2" : "s3";
  const linkHref = t.scope_type === "constituency" && t.scope_id
    ? `/firm/constituency/${t.scope_id}`
    : null;

  return (
    <Card className="border-l-4" style={{ borderLeftColor: bandColor }}>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted">
              {t.scope_type === "cm" ? "Chief Minister" : t.scope_type === "minister" ? "Minister" : "Constituency"}
            </div>
            <CardTitle className={large ? "text-2xl" : ""}>{t.entity_name}</CardTitle>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge variant={bandVariant}>{t.threat_band.toUpperCase()}</Badge>
            <span className="text-[10px] text-muted numeric-callout">{t.threat_score.toFixed(2)}</span>
          </div>
        </div>
        <CardDescription className="mt-2 text-sm leading-relaxed text-foreground/85">
          {t.headline}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {t.threats.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted">Specific threats</div>
            <ul className="mt-2 space-y-2">
              {t.threats.map((th, i) => (
                <li key={i} className="rounded border border-border bg-sand/40 p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-sm font-medium text-navy">{th.title}</div>
                    <div className="flex shrink-0 gap-1">
                      <Badge variant={th.severity === "critical" || th.severity === "high" ? "s1" : th.severity === "medium" ? "s2" : "s3"}>{th.severity}</Badge>
                      <Badge variant="outline">{horizonLabel(th.time_horizon)}</Badge>
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-foreground/80">{th.description}</p>
                </li>
              ))}
            </ul>
          </div>
        )}

        {t.recommended_actions.length > 0 && (
          <div className="mt-4">
            <div className="text-[10px] uppercase tracking-wider text-muted">Recommended pre-emptive actions</div>
            <ul className="mt-2 space-y-1.5">
              {t.recommended_actions.map((a, i) => (
                <li key={i} className="flex gap-2 text-xs">
                  <span className={`mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full ${a.urgency === "now" ? "bg-severity-1" : a.urgency === "today" ? "bg-bronze" : "bg-muted"}`} />
                  <div>
                    <span className="text-foreground/85">{a.action}</span>
                    <span className="text-muted"> · {ownerLabel(a.owner)} · {urgencyLabel(a.urgency)}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-[10px] text-muted">
          <span>
            {t.evidence_event_ids.length} evidence signal{t.evidence_event_ids.length === 1 ? "" : "s"} · {t.model_version ?? "model"}
          </span>
          <span>
            Refreshed {formatDistanceToNowStrict(new Date(t.generated_at))} ago
            {linkHref && <> · <Link href={linkHref} className="text-bronze underline">Open seat</Link></>}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function horizonLabel(h: string) { return h === "next_24h" ? "24h" : h === "next_7d" ? "7d" : h === "next_30d" ? "30d" : h; }
function urgencyLabel(u: string) { return u === "now" ? "Now" : u === "today" ? "Today" : u === "this_week" ? "This week" : u; }
function ownerLabel(o: string) {
  return ({
    analyst: "Analyst",
    outlet_partner: "Outlet partner",
    voice_network: "Voice network",
    minister_office: "Minister's office",
    cm_office: "CM office",
    external: "External",
  } as Record<string, string>)[o] ?? o;
}
