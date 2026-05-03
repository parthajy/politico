import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Markdown } from "@/components/markdown";
import { PrintButton } from "./print-button";
import { format } from "date-fns";

export const dynamic = "force-dynamic";

export default async function PartyBrief({ searchParams }: { searchParams: { date?: string } }) {
  const sb = createClient();

  let q = sb
    .from("briefs")
    .select("id, brief_date, body_md, published_at, generated_by_model")
    .not("published_at", "is", null);
  if (searchParams.date) q = q.eq("brief_date", searchParams.date);

  const { data: latest } = await q.order("brief_date", { ascending: false }).limit(1).maybeSingle();

  const { data: archive } = await sb
    .from("briefs")
    .select("id, brief_date")
    .not("published_at", "is", null)
    .order("brief_date", { ascending: false })
    .limit(20);

  return (
    <div className="container mx-auto max-w-4xl px-6 py-10 print:max-w-none print:px-0 print:py-0">
      <div className="text-xs uppercase tracking-[0.18em] text-bronze no-print">Today&apos;s Brief</div>
      <div className="mt-2 grid gap-8 lg:grid-cols-[1fr_220px] print:block">
        <article className="brief-print">
          {!latest && (
            <Card>
              <CardHeader><CardTitle>No published brief yet</CardTitle></CardHeader>
              <CardContent className="text-sm text-muted">
                Today&apos;s brief lands here once the firm publishes it. The first generation may take ~60 seconds.
              </CardContent>
            </Card>
          )}
          {latest && (
            <>
              <div className="flex items-baseline justify-between print:block">
                <h1 className="font-serif text-3xl font-bold text-navy print:text-2xl">
                  {format(new Date(latest.brief_date), "EEEE, d MMMM yyyy")}
                </h1>
                <PrintButton />
              </div>
              <div className="text-xs text-muted no-print">
                Published {format(new Date(latest.published_at!), "d MMM, HH:mm")} · {latest.generated_by_model ?? "manual"}
              </div>
              <Markdown source={latest.body_md ?? ""} className="prose prose-sm mt-6 max-w-none font-serif text-foreground print:mt-3 print:text-[11pt] print:leading-snug" />
            </>
          )}
        </article>
        <aside className="no-print">
          <div className="text-xs uppercase tracking-wider text-muted">Archive</div>
          <ul className="mt-2 space-y-1 text-sm">
            {(archive ?? []).map((b) => (
              <li key={b.id}>
                <Link href={`/party/brief?date=${b.brief_date}`} className="text-navy hover:underline">
                  {format(new Date(b.brief_date), "d MMM")}
                </Link>
              </li>
            ))}
            {(archive ?? []).length === 0 && <li className="text-muted">No archived briefs.</li>}
          </ul>
        </aside>
      </div>
    </div>
  );
}
