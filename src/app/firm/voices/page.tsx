import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { VoicesFilter } from "./voices-filter";

export const dynamic = "force-dynamic";

type SearchParams = { district?: string; active?: string };

export default async function VoicesPage({ searchParams }: { searchParams: SearchParams }) {
  const sb = createClient();

  let query = sb
    .from("voices")
    .select("id, name, role, district_id, active, joined_at, last_engagement_at, ever_paid, ever_scripted, districts(name)")
    .order("name");

  if (searchParams.district) query = query.eq("district_id", parseInt(searchParams.district, 10));
  if (searchParams.active === "1") query = query.eq("active", true);
  if (searchParams.active === "0") query = query.eq("active", false);

  const { data: voices, error } = await query;
  if (error) {
    return <div className="container mx-auto px-6 py-10 text-sm text-severity-1">Voices query failed: {error.message}</div>;
  }
  const { data: districts } = await sb.from("districts").select("id, name").order("name");

  // Doctrine 4 stats
  const total = voices?.length ?? 0;
  const everPaid = voices?.filter((v) => v.ever_paid).length ?? 0;
  const everScripted = voices?.filter((v) => v.ever_scripted).length ?? 0;
  const active = voices?.filter((v) => v.active).length ?? 0;

  return (
    <div className="container mx-auto max-w-7xl px-6 py-10">
      <div className="text-xs uppercase tracking-[0.18em] text-bronze">Voices CRM</div>
      <h1 className="mt-2 font-serif text-3xl font-bold text-navy">Local voices</h1>
      <p className="mt-1 text-sm text-muted">First-class object per Doctrine 3 (Local Voice First). Audit columns enforce Doctrine 4 (No Paid Narrative).</p>

      <div className="mt-6 grid gap-4 md:grid-cols-4">
        <Stat label="Total voices" value={total.toString()} />
        <Stat label="Active" value={active.toString()} />
        <Stat label="Ever paid" value={everPaid.toString()} highlight={everPaid === 0} />
        <Stat label="Ever scripted" value={everScripted.toString()} highlight={everScripted === 0} />
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Voices</CardTitle>
          <CardDescription>Filter by district or status. Audit columns are read-only and enforce compliance.</CardDescription>
        </CardHeader>
        <CardContent>
          <VoicesFilter districts={districts ?? []} initial={searchParams} />
          <div className="mt-4 overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-sand text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-3 py-2 text-left">Name</th>
                  <th className="px-3 py-2 text-left">Role</th>
                  <th className="px-3 py-2 text-left">District</th>
                  <th className="px-3 py-2 text-left">Joined</th>
                  <th className="px-3 py-2 text-left">Last engaged</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Audit</th>
                </tr>
              </thead>
              <tbody>
                {(voices ?? []).map((v) => {
                  const dist = (v.districts as unknown) as { name: string } | null;
                  return (
                    <tr key={v.id} className="border-b border-border last:border-0">
                      <td className="px-3 py-2 font-medium text-navy">{v.name}</td>
                      <td className="px-3 py-2 text-xs text-muted">{v.role ?? "—"}</td>
                      <td className="px-3 py-2 text-xs">{dist?.name ?? "—"}</td>
                      <td className="px-3 py-2 text-xs text-muted">{v.joined_at ? format(new Date(v.joined_at), "MMM yyyy") : "—"}</td>
                      <td className="px-3 py-2 text-xs text-muted">{v.last_engagement_at ? format(new Date(v.last_engagement_at), "d MMM") : "—"}</td>
                      <td className="px-3 py-2"><Badge variant={v.active ? "positive" : "outline"}>{v.active ? "active" : "dormant"}</Badge></td>
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
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="text-xs uppercase tracking-wider text-muted">{label}</div>
        <div className={`numeric-callout text-3xl ${highlight ? "text-positive" : "text-navy"}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
