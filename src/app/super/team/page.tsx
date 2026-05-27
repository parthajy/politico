import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TeamClient } from "./team-client";

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

export default async function SuperTeamPage() {
  const sb = createClient();
  const { data: districts } = await sb.from("districts").select("id, name").order("name");
  const { data: members } = await sb
    .from("users")
    .select("id, full_name, email, role, phone, photo_url, district_id, languages, joined_at, active, notes, districts(name)")
    .in("role", ["superadmin", "volunteer", "firm_intern", "firm_admin", "firm_analyst"])
    .order("role")
    .order("full_name");

  const rows = (members ?? []) as unknown as Row[];

  // Pull volunteer sessions — including tokens (superadmin sees plaintext)
  const volunteerIds = rows.filter((r) => r.role === "volunteer").map((r) => r.id);
  const sessions: Record<string, { token: string; issued_at: string; expires_at: string; last_seen_at: string | null; device_label: string | null }> = {};
  if (volunteerIds.length > 0) {
    const { data: sess } = await sb
      .from("volunteer_sessions")
      .select("user_id, token, issued_at, expires_at, last_seen_at, device_label")
      .in("user_id", volunteerIds);
    for (const s of sess ?? []) sessions[s.user_id] = { token: s.token, issued_at: s.issued_at, expires_at: s.expires_at, last_seen_at: s.last_seen_at, device_label: s.device_label };
  }

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

  const superadmins = rows.filter((r) => r.role === "superadmin");
  const firmStaff = rows.filter((r) => r.role === "firm_admin" || r.role === "firm_analyst");
  const interns = rows.filter((r) => r.role === "firm_intern");
  const volunteers = rows.filter((r) => r.role === "volunteer");

  return (
    <div className="container mx-auto max-w-6xl px-6 py-10">
      <div className="text-xs uppercase tracking-[0.18em] text-bronze">People · superadmin</div>
      <h1 className="mt-2 font-serif text-3xl font-bold text-navy">Team management</h1>
      <p className="mt-1 text-sm text-muted">
        Only superadmin can create, deactivate, or rotate access. Volunteers get a token; interns + analysts + admins sign in by email OTP.
      </p>

      <TeamClient districts={districts ?? []} />

      <Section title="Superadmins" count={superadmins.length}>
        {superadmins.length === 0 ? <Empty>Bootstrap your first one via seed script.</Empty> : (
          <ul className="space-y-2">
            {superadmins.map((s) => <li key={s.id} className="rounded border border-border bg-white p-3"><MemberHeader r={s} extra={<Badge variant="bronze">Superadmin</Badge>} /></li>)}
          </ul>
        )}
      </Section>

      <Section title="Firm staff (admin · analyst)" count={firmStaff.length}>
        {firmStaff.length === 0 ? <Empty>None yet.</Empty> : (
          <ul className="space-y-2">
            {firmStaff.map((s) => <li key={s.id} className="rounded border border-border bg-white p-3"><MemberHeader r={s} extra={<Badge variant="navy">{s.role === "firm_admin" ? "Admin" : "Analyst"}</Badge>} /></li>)}
          </ul>
        )}
      </Section>

      <Section title="Interns" count={interns.length}>
        {interns.length === 0 ? <Empty>None yet. Interns sign in via OTP — you just enter their email.</Empty> : (
          <ul className="space-y-2">
            {interns.map((i) => <li key={i.id} className="rounded border border-border bg-white p-3"><MemberHeader r={i} /></li>)}
          </ul>
        )}
      </Section>

      <Section title="Volunteers (field network)" count={volunteers.length}>
        {volunteers.length === 0 ? <Empty>None yet — use the form above to add one.</Empty> : (
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
                  {/* Token row — visible to superadmin, with reveal + copy + rotate */}
                  {s ? (
                    <div className="mt-3 border-t border-border pt-2">
                      <VolunteerToken userId={v.id} token={s.token} issuedAt={s.issued_at} expiresAt={s.expires_at} lastSeenAt={s.last_seen_at} />
                    </div>
                  ) : (
                    <div className="mt-2 text-[11px] text-muted">No session — issue one from the form above.</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </div>
  );
}

// inline import to avoid a separate file; this is a tiny client island
import { TokenChip } from "./token-chip";
function VolunteerToken(p: { userId: string; token: string; issuedAt: string; expiresAt: string; lastSeenAt: string | null }) {
  return <TokenChip {...p} />;
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
        // eslint-disable-next-line @next/next/no-img-element
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
