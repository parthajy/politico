import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { QueueClient, type QueueRow } from "./queue-client";
import { IntakeForm } from "@/app/firm/intake/intake-form";

export const dynamic = "force-dynamic";

export default async function QueuePage() {
  const sb = createClient();

  // Pending + needs_human queue, newest first
  const { data: rows } = await sb
    .from("field_submissions")
    .select(`
      id, submitter_id, url, screenshot_url, note, suggested_district_id, platform,
      extract_quality, ai_title, ai_body, ai_classification, status, created_at,
      ocr_caption,
      users:submitter_id ( id, full_name, email, role, photo_url, districts(name) )
    `)
    .in("status", ["pending", "ai_processed", "needs_human"])
    .order("created_at", { ascending: false })
    .limit(50);

  const queue = (rows ?? []).map((r) => {
    const u = (r.users as unknown) as { id: string; full_name: string | null; email: string; role: string; photo_url: string | null; districts: { name: string } | null } | null;
    return {
      id: r.id,
      url: r.url,
      screenshot_url: r.screenshot_url,
      note: r.note,
      platform: r.platform,
      extract_quality: r.extract_quality,
      ai_title: r.ai_title,
      ai_body: r.ai_body,
      ai_classification: r.ai_classification as Record<string, unknown> | null,
      status: r.status,
      created_at: r.created_at,
      ocr_caption: r.ocr_caption,
      submitter: u ? {
        name: u.full_name ?? u.email,
        role: u.role,
        photo_url: u.photo_url,
        district: u.districts?.name ?? null,
      } : null,
    } as QueueRow;
  });

  const { data: districts } = await sb.from("districts").select("id, name").order("name");

  // Yesterday's stats for the analyst summary
  const since24h = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { data: recent24 } = await sb
    .from("field_submissions")
    .select("status")
    .gte("created_at", since24h);
  const stats24 = {
    accepted: (recent24 ?? []).filter((r) => r.status === "accepted").length,
    rejected: (recent24 ?? []).filter((r) => r.status === "rejected").length,
    pending: (recent24 ?? []).filter((r) => r.status !== "accepted" && r.status !== "rejected").length,
  };

  return (
    <div className="container mx-auto max-w-7xl px-6 py-10">
      <div className="text-xs uppercase tracking-[0.18em] text-bronze">Triage queue</div>
      <h1 className="mt-2 font-serif text-3xl font-bold text-navy">What the field is sending in</h1>
      <p className="mt-1 text-sm text-muted">
        AI takes a first pass. If the extract is good, you 1-click approve. If it&apos;s blocked (X, FB, IG without screenshot), open the URL in your logged-in browser, paste the content, fill the form, accept.
      </p>

      <div className="mt-6 grid gap-3 md:grid-cols-3">
        <Stat label="In queue · 24h" value={String(stats24.pending)} />
        <Stat label="Accepted · 24h" value={String(stats24.accepted)} />
        <Stat label="Rejected · 24h" value={String(stats24.rejected)} />
      </div>

      {/* Add manually — folded in from the old /firm/intake page */}
      <Card className="mt-6 border-bronze/30">
        <CardHeader>
          <CardTitle>Add manually</CardTitle>
          <CardDescription>
            Paste a URL or attach a screenshot you encountered yourself. Goes straight to the inbox (skips intern review).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <IntakeForm districts={districts ?? []} />
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Pending field submissions</CardTitle>
          <CardDescription>{queue.length} submissions awaiting review. Oldest at the bottom.</CardDescription>
        </CardHeader>
        <CardContent>
          {queue.length === 0 ? (
            <div className="rounded border border-dashed border-border p-8 text-center text-sm text-muted">
              Queue is empty. Volunteers haven&apos;t submitted, or everything has been triaged.
            </div>
          ) : (
            <QueueClient rows={queue} districts={districts ?? []} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="text-[10px] uppercase tracking-wider text-muted">{label}</div>
        <div className="numeric-callout mt-1 text-3xl text-navy">{value}</div>
      </CardContent>
    </Card>
  );
}
