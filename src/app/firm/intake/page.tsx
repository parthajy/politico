import { createClient } from "@/lib/supabase/server";
import { IntakeForm } from "./intake-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDistanceToNowStrict } from "date-fns";

export const dynamic = "force-dynamic";

export default async function IntakePage() {
  const sb = createClient();
  const { data: districts } = await sb.from("districts").select("id, name").order("name");

  // Recent intake submissions for the activity panel
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
        Paste a URL the system should know about — Twitter post, FB share, news article, WhatsApp forward,
        screenshot. The desk fetches it, OCRs any image, classifies it, and drops it into the inbox.
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
          <CardTitle>Recent intake</CardTitle>
          <CardDescription>Last 10 manual submissions across the firm.</CardDescription>
        </CardHeader>
        <CardContent>
          {(recent ?? []).length === 0 ? (
            <div className="py-6 text-center text-xs text-muted">No intake yet.</div>
          ) : (
            <ul className="divide-y divide-border">
              {(recent ?? []).map((r) => {
                const meta = ((r.raw_payload ?? {}) as Record<string, unknown>);
                const volunteer = meta.volunteer_name as string | null;
                return (
                  <li key={r.id} className="flex items-start justify-between gap-3 py-2 text-sm">
                    <div className="flex-1">
                      <div className="line-clamp-2 font-medium text-navy">
                        {r.url ? <a href={r.url} target="_blank" rel="noreferrer" className="hover:underline">{r.title}</a> : r.title}
                      </div>
                      <div className="text-[11px] text-muted">
                        {volunteer ? `via ${volunteer} (field) · ` : ""}{formatDistanceToNowStrict(new Date(r.ingested_at))} ago
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
