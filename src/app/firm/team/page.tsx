import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TeamClient } from "./team-client";
import { format, formatDistanceToNowStrict } from "date-fns";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  full_name: string | null;
  email: string;
  role: string;
  phone: string | null;
  photo_url: string | null;
  district_id: number | null;
  languages: string[] | null;
  joined_at: string | null;
  active: boolean | null;
  notes: string | null;
  districts: { name: string } | null;
};

export default async function TeamPage() {
  const sb = createClient();
  const { data: districts } = await sb.from("districts").select("id, name").order("name");
  const { data: members } = await sb
    .from("users")
    .select("id, full_name, email, role, phone, photo_url, district_id, languages, joined_at, active, notes, districts(name)")
    .in("role", ["volunteer", "firm_intern", "firm_admin", "firm_analyst"])
    .order("role")
    .order("full_name");

  const rows = (members ?? []) as unknown as Row[];

  // Pull volunteer sessions so we can show token-issued / expires
  const volunteerIds = rows.filter((r) => r.role === "volunteer").map((r) => r.id);
  const sessions: Record<string, { token: string; issued_at: string; expires_at: string; last_seen_at: string | null; device_label: string | null }> = {};
  if (volunteerIds.length > 0) {
    const { data: sess } = await sb
      .from("volunteer_sessions")
      .select("user_id, token, issued_at, expires_at, last_seen_at, device_label")
      .in("user_id", volunteerIds);
    for (const s of sess ?? []) sessions[s.user_id] = { token: s.token, issued_at: s.issued_at, expires_at: s.expires_at, last_seen_at: s.last_seen_at, device_label: s.device_label };
  }

  // Recent submission counts per volunteer (last 30 days)
  const submissionCounts: Record<string, { total: number; accepted: number }> = {};
  if (volunteerIds.length > 0) {
    const { data: sub } = await sb
      .from("field_submissions")
      .select("submitter_id, status")
      .in("submitter_id", volunteerIds);
    for (const s of sub ?? []) {
      const cur = submissionCounts[s.submitter_id] ?? { total: 0, accepted: 0 };
      cur.total += 1;
      if (s.status === "accepted") cur.accepted += 1;
      submissionCounts[s.submitter_id] = cur;
    }
  }

  const volunteers = rows.filter((r) => r.role === "volunteer");
  const interns = rows.filter((r) => r.role === "firm_intern");
  const firmStaff = rows.filter((r) => r.role === "firm_admin" || r.role === "firm_analyst");

  return (
    <div className="container mx-auto max-w-6xl px-6 py-10">
      <div className="text-xs uppercase tracking-[0.18em] text-bronze">Team</div>
      <h1 className="mt-2 font-serif text-3xl font-bold text-navy">Volunteers, interns, and firm staff</h1>
      <p className="mt-1 text-sm text-muted">
        Field volunteers feed the desk; interns triage; analysts publish. Admin sees the whole map.
      </p>

      <TeamClient districts={districts ?? []} />

      <Section title="Volunteers · field network" count={volunteers.length}>
        {volunteers.length === 0 ? <Empty>No volunteers yet — use the form above to add one.</Empty> : (
          <ul className="space-y-3">
            {volunteers.map((v) => {
              const s = sessions[v.id];
              const counts = submissionCounts[v.id] ?? { total: 0, accepted: 0 };
              return (
                <li key={v.id} className="rounded border border-border bg-white p-3">
                  <MemberHeader r={v} extra={v.districts?.name ? <Badge variant="default">{v.districts.name}</Badge> : null} />
                  <div className="mt-2 grid grid-cols-3 gap-3 text-xs">
                    <Stat label="Submitted" value={counts.total.toString()} />
                    <Stat label="Accepted" value={counts.accepted.toString()} />
                    <Stat label="Acceptance" value={counts.total > 0 ? `${Math.round((counts.accepted / counts.total) * 100)}%` : "—"} />
                  </div>
                  {s && (
                    <div className="mt-2 text-[11px] text-muted">
                      Token issued {formatDistanceToNowStrict(new Date(s.issued_at))} ago · expires {format(new Date(s.expires_at), "d MMM yyyy")}
                      {s.last_seen_at && <> · last seen {formatDistanceToNowStrict(new Date(s.last_seen_at))} ago</>}
                      {s.device_label && <> · {s.device_label}</>}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title="Interns · office triage" count={interns.length}>
        {interns.length === 0 ? <Empty>No interns yet — add via the form to give them login credentials.</Empty> : (
          <ul className="space-y-2">
            {interns.map((i) => <li key={i.id} className="rounded border border-border bg-white p-3"><MemberHeader r={i} /></li>)}
          </ul>
        )}
      </Section>

      <Section title="Firm staff" count={firmStaff.length}>
        <ul className="space-y-2">
          {firmStaff.map((s) => <li key={s.id} className="rounded border border-border bg-white p-3"><MemberHeader r={s} /></li>)}
        </ul>
      </Section>
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <Card className="mt-6">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{title}</CardTitle>
          <Badge variant="outline">{count}</Badge>
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded border border-dashed border-border p-4 text-center text-xs text-muted">{children}</div>;
}

function MemberHeader({ r, extra }: { r: Row; extra?: React.ReactNode }) {
  const initials = (r.full_name ?? r.email).split(/\s+/).slice(0, 2).map((s) => s[0]?.toUpperCase()).join("");
  return (
    <div className="flex items-center gap-3">
      {r.photo_url ? (
        <img src={r.photo_url} alt={r.full_name ?? r.email} className="h-10 w-10 rounded-full object-cover" />
      ) : (
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sand-deep text-sm font-bold text-navy">{initials}</div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <div className="truncate font-medium text-navy">{r.full_name ?? r.email}</div>
          {!r.active && <Badge variant="outline">inactive</Badge>}
        </div>
        <div className="text-[11px] text-muted truncate">
          {r.email}{r.phone ? ` · ${r.phone}` : ""}{r.languages?.length ? ` · ${r.languages.join(", ")}` : ""}
        </div>
      </div>
      {extra}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted">{label}</div>
      <div className="numeric-callout text-lg text-navy">{value}</div>
    </div>
  );
}
