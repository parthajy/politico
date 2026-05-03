import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNowStrict } from "date-fns";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await sb.from("users").select("role").eq("id", user.id).single();
  if (profile?.role !== "firm_admin") {
    return (
      <div className="container mx-auto max-w-3xl px-6 py-10">
        <Card>
          <CardHeader><CardTitle>Audit log</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted">
            Admin-only. Your role: {profile?.role ?? "—"}.
          </CardContent>
        </Card>
      </div>
    );
  }

  const { data: rows, error } = await sb
    .from("audit_log")
    .select("id, action, entity_type, entity_id, user_id, metadata, created_at, users(email)")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="container mx-auto max-w-6xl px-6 py-10">
      <div className="text-xs uppercase tracking-[0.18em] text-bronze">Audit</div>
      <h1 className="mt-2 font-serif text-3xl font-bold text-navy">Audit log</h1>
      <p className="mt-1 text-sm text-muted">Last 100 mutating actions. Source of truth for the firm and the client.</p>

      {error && <div className="mt-4 text-sm text-severity-1">{error.message}</div>}

      <Card className="mt-6">
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-sand text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="px-3 py-2 text-left">When</th>
                <th className="px-3 py-2 text-left">Action</th>
                <th className="px-3 py-2 text-left">User</th>
                <th className="px-3 py-2 text-left">Entity</th>
                <th className="px-3 py-2 text-left">Detail</th>
              </tr>
            </thead>
            <tbody>
              {(rows ?? []).length === 0 && (
                <tr><td colSpan={5} className="px-3 py-8 text-center text-muted">No audit events yet.</td></tr>
              )}
              {(rows ?? []).map((r) => {
                const u = (r.users as unknown) as { email: string } | null;
                return (
                  <tr key={r.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 text-xs text-muted">{formatDistanceToNowStrict(new Date(r.created_at))} ago</td>
                    <td className="px-3 py-2"><Badge variant={r.action.startsWith("triage_escalated") ? "s2" : "default"}>{r.action}</Badge></td>
                    <td className="px-3 py-2 text-xs">{u?.email ?? r.user_id?.slice(0, 8) ?? "system"}</td>
                    <td className="px-3 py-2 text-xs text-muted">{r.entity_type ?? "—"}{r.entity_id ? ` · ${r.entity_id.slice(0, 8)}…` : ""}</td>
                    <td className="px-3 py-2 text-xs text-muted">
                      {r.metadata && typeof r.metadata === "object" ? JSON.stringify(r.metadata).slice(0, 80) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
