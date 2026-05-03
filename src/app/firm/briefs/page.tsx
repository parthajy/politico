import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GenerateBriefButton } from "./generate-button";
import { format } from "date-fns";

export const dynamic = "force-dynamic";

export default async function BriefsPage() {
  const sb = createClient();
  const { data: briefs } = await sb
    .from("briefs")
    .select("id, brief_date, generated_at, generated_by_model, published_at, approved_by, body_md")
    .order("brief_date", { ascending: false })
    .limit(30);

  return (
    <div className="container mx-auto max-w-5xl px-6 py-10">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-bronze">Briefs</div>
          <h1 className="mt-2 font-serif text-3xl font-bold text-navy">Morning Signal Brief</h1>
          <p className="mt-1 text-sm text-muted">~700 words. Streamed in &lt;90s. Save → edit → Publish moves it to the party view.</p>
        </div>
        <GenerateBriefButton />
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Past briefs</CardTitle>
          <CardDescription>{(briefs ?? []).length} on record.</CardDescription>
        </CardHeader>
        <CardContent>
          {(briefs ?? []).length === 0 && (
            <div className="rounded border border-dashed border-border p-8 text-center text-sm text-muted">
              No briefs yet. Click &quot;Generate today&apos;s brief&quot; to create the first one.
            </div>
          )}
          {(briefs ?? []).length > 0 && (
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-sand text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Model</th>
                  <th className="px-3 py-2 text-left">Length</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-right"></th>
                </tr>
              </thead>
              <tbody>
                {(briefs ?? []).map((b) => (
                  <tr key={b.id} className="border-b border-border last:border-0 hover:bg-sand/40">
                    <td className="px-3 py-2 font-medium text-navy">{format(new Date(b.brief_date), "EEE, d MMM yyyy")}</td>
                    <td className="px-3 py-2 text-xs text-muted">{b.generated_by_model ?? "—"}</td>
                    <td className="px-3 py-2 text-xs text-muted">{b.body_md ? `${Math.round((b.body_md ?? "").length / 5)} words` : "—"}</td>
                    <td className="px-3 py-2">
                      {b.published_at
                        ? <Badge variant="positive">published</Badge>
                        : <Badge variant="outline">draft</Badge>}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link href={`/firm/briefs/${b.id}`} className="text-xs text-bronze underline">Open →</Link>
                    </td>
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
