import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { IntakeForm } from "./intake-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNowStrict } from "date-fns";

export const dynamic = "force-dynamic";

function displayTitle(title: string | null, url: string | null): string {
  if (title && title !== "(no title)" && title !== "(manual intake)") return title;
  if (url) {
    try {
      const u = new URL(url);
      return `${u.hostname.replace(/^www\./, "")}${u.pathname.length > 1 ? u.pathname : ""}`.slice(0, 90);
    } catch { return url.slice(0, 90); }
  }
  return "(no title)";
}

function domainOf(url: string | null): string | null {
  if (!url) return null;
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return null; }
}

export default async function IntakePage() {
  const sb = createClient();
  const { data: districts } = await sb.from("districts").select("id, name").order("name");

  const { data: recent } = await sb
    .from("events")
    .select("id, title, url, ingested_at, raw_payload")
    .eq("source", "manual")
    .order("ingested_at", { ascending: false })
    .limit(10);

  return (
    <div className="container mx-auto max-w-5xl px-6 py-10">
      <div className="text-xs uppercase tracking-[0.18em] text-bronze">Intake</div>
      <h1 className="mt-2 font-serif text-3xl font-bold text-navy">Drop anything into the desk</h1>
      <p className="mt-1 text-sm text-muted">
        News article URL → we fetch and classify automatically. Social posts (X, Facebook, Instagram, Threads) → URL <em>plus</em> a screenshot — we OCR the text the platform won&apos;t serve to a bot.
      </p>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>New signal</CardTitle>
          <CardDescription>
            URL OR screenshot — at least one. Add the volunteer&apos;s name if it came from the field network.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <IntakeForm districts={districts ?? []} />
        </CardContent>
      </Card>

      <Card className="mt-8">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Recent intake</CardTitle>
              <CardDescription>Last 10 manual submissions across the firm.</CardDescription>
            </div>
            <Link href="/firm?source=manual&sort=age&dir=desc" className="text-xs text-bronze underline">
              See all in inbox →
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {(recent ?? []).length === 0 ? (
            <div className="py-6 text-center text-xs text-muted">No intake yet.</div>
          ) : (
            <ul className="divide-y divide-border">
              {(recent ?? []).map((r) => {
                const meta = ((r.raw_payload ?? {}) as Record<string, unknown>);
                const volunteer = meta.volunteer_name as string | null;
                const hasScreenshot = meta.has_screenshot as boolean | undefined;
                const dom = domainOf(r.url);
                const shown = displayTitle(r.title, r.url);
                return (
                  <li key={r.id} className="flex items-start justify-between gap-3 py-2 text-sm">
                    <div className="flex-1">
                      <div className="line-clamp-2 font-medium text-navy">
                        {r.url ? <a href={r.url} target="_blank" rel="noreferrer" className="hover:underline">{shown}</a> : shown}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                        {dom && <Badge variant="outline">{dom}</Badge>}
                        {hasScreenshot && <Badge variant="default">screenshot</Badge>}
                        {volunteer && <span>via {volunteer} (field)</span>}
                        <span>· {formatDistanceToNowStrict(new Date(r.ingested_at))} ago</span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
