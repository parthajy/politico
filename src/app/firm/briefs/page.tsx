import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";

export const dynamic = "force-dynamic";

export default async function BriefsPage() {
  const sb = createClient();
  const { data: briefs } = await sb
    .from("briefs")
    .select("id, brief_date, generated_at, generated_by_model, published_at, approved_by")
    .order("brief_date", { ascending: false })
    .limit(30);

  return (
    <div className="container mx-auto max-w-5xl px-6 py-10">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-bronze">Briefs</div>
          <h1 className="mt-2 font-serif text-3xl font-bold text-navy">Morning Signal Brief</h1>
          <p className="mt-1 text-sm text-muted">Generation lands in Day 4. This page lists past briefs and exposes the Generate action.</p>
        </div>
        <Button variant="bronze" disabled title="Day 4">Generate today&apos;s brief</Button>
      </div>

      <Card className="mt-6">
        <CardHeader><CardTitle>Past briefs</CardTitle></CardHeader>
        <CardContent>
          {(briefs ?? []).length === 0 && (
            <div className="rounded border border-dashed border-border p-8 text-center text-sm text-muted">
              No briefs yet. Day 4 ships the gpt-4o generator.
            </div>
          )}
          {(briefs ?? []).length > 0 && (
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-sand text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Model</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Approved by</th>
                </tr>
              </thead>
              <tbody>
                {(briefs ?? []).map((b) => (
                  <tr key={b.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2">{format(new Date(b.brief_date), "EEE, d MMM yyyy")}</td>
                    <td className="px-3 py-2 text-xs text-muted">{b.generated_by_model ?? "—"}</td>
                    <td className="px-3 py-2">
                      {b.published_at ? <Badge variant="positive">published</Badge> : <Badge variant="outline">draft</Badge>}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted">{b.approved_by ? b.approved_by.slice(0, 8) + "…" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
