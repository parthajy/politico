import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format } from "date-fns";

export const dynamic = "force-dynamic";

export default async function PartyBrief() {
  const sb = createClient();
  const { data: latest } = await sb
    .from("briefs")
    .select("id, brief_date, body_md, published_at")
    .not("published_at", "is", null)
    .order("brief_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: archive } = await sb
    .from("briefs")
    .select("id, brief_date")
    .not("published_at", "is", null)
    .order("brief_date", { ascending: false })
    .limit(20);

  return (
    <div className="container mx-auto max-w-4xl px-6 py-10">
      <div className="text-xs uppercase tracking-[0.18em] text-bronze">Today&apos;s Brief</div>
      <div className="mt-2 grid gap-8 lg:grid-cols-[1fr_220px]">
        <article>
          {!latest && (
            <Card>
              <CardHeader><CardTitle>No published brief yet</CardTitle></CardHeader>
              <CardContent className="text-sm text-muted">
                Today&apos;s brief lands here once the firm publishes it. Brief generation goes live in Day 4.
              </CardContent>
            </Card>
          )}
          {latest && (
            <>
              <h1 className="font-serif text-3xl font-bold text-navy">
                {format(new Date(latest.brief_date), "EEEE, d MMMM yyyy")}
              </h1>
              <div className="prose prose-sm mt-6 max-w-none text-foreground">
                {(latest.body_md ?? "").split("\n").map((line: string, i: number) => (
                  <p key={i} className="my-2 leading-relaxed">{line}</p>
                ))}
              </div>
            </>
          )}
        </article>
        <aside>
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
