"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { formatDistanceToNowStrict } from "date-fns";
import { toast } from "sonner";

type Submission = {
  id: string; url: string | null; note: string | null; status: string;
  created_at: string; reviewed_at: string | null; rejection_reason: string | null;
};

export function VolunteerHome({
  name, district, counts, submissions,
}: {
  name: string; district: string | null;
  counts: { total: number; accepted: number; rejected: number; pending: number };
  submissions: Submission[];
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const extraFileRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageName, setImageName] = useState<string | null>(null);
  // Extra screenshots — comment threads, audience reactions, etc.
  const [extraImages, setExtraImages] = useState<{ name: string; dataUrl: string }[]>([]);
  // Comments / reactions context — what the volunteer observed beyond the
  // post itself. Goes into the intelligence-extraction pipeline.
  const [commentsText, setCommentsText] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) { toast.error("Image must be under 8 MB"); return; }
    const buf = await f.arrayBuffer();
    const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
    setImageDataUrl(`data:${f.type};base64,${b64}`);
    setImageName(f.name);
  }

  async function handleExtraFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    const remainingSlots = 4 - extraImages.length;
    if (files.length > remainingSlots) {
      toast.error(`Max 4 extra screenshots total. Skipping ${files.length - remainingSlots}.`);
    }
    for (const f of files.slice(0, remainingSlots)) {
      if (f.size > 8 * 1024 * 1024) { toast.error(`${f.name} > 8 MB — skipped`); continue; }
      const buf = await f.arrayBuffer();
      const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
      setExtraImages((arr) => [...arr, { name: f.name, dataUrl: `data:${f.type};base64,${b64}` }]);
    }
    if (extraFileRef.current) extraFileRef.current.value = "";
  }

  function removeExtra(idx: number) {
    setExtraImages((arr) => arr.filter((_, i) => i !== idx));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim() && !imageDataUrl) { toast.error("Paste a URL or take a screenshot"); return; }
    setBusy(true);
    const t = toast.loading("Submitting…");
    try {
      const r = await fetch("/api/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url.trim() || undefined,
          note: note.trim() || undefined,
          image_data_url: imageDataUrl ?? undefined,
          extra_images: extraImages.map((x) => x.dataUrl),
          comments_text: commentsText.trim() || undefined,
        }),
      });
      const j = await r.json();
      toast.dismiss(t);
      if (!r.ok || !j.ok) {
        toast.error(j.error ?? "Submission failed");
        return;
      }
      toast.success(j.message ?? "Submitted — desk will review");
      setUrl(""); setNote(""); setImageDataUrl(null); setImageName(null);
      setExtraImages([]); setCommentsText("");
      if (fileRef.current) fileRef.current.value = "";
      if (extraFileRef.current) extraFileRef.current.value = "";
      router.refresh();
    } catch (e) {
      toast.dismiss(t);
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    const sb = createClient();
    await sb.auth.signOut();
    router.push("/v/login");
    router.refresh();
  }

  return (
    <div className="container mx-auto max-w-md px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Image src="/logo.png" alt="Samvidya" width={1114} height={242} className="h-6 w-auto" priority />
        <button onClick={signOut} className="text-xs text-muted hover:text-foreground">Sign out</button>
      </div>
      <div className="mt-3 text-[10px] uppercase tracking-[0.18em] text-bronze">Field volunteer</div>
      <h1 className="mt-1 font-serif text-2xl font-bold text-navy">{name}</h1>
      <p className="mt-0.5 text-xs text-muted">{district ? `${district} district` : "District not set"}</p>

      {/* Stats */}
      <div className="mt-4 grid grid-cols-4 gap-2 text-center">
        <Tile label="Sent" value={counts.total.toString()} />
        <Tile label="Accepted" value={counts.accepted.toString()} tone="good" />
        <Tile label="Pending" value={counts.pending.toString()} />
        <Tile label="Rejected" value={counts.rejected.toString()} tone={counts.rejected > 0 ? "warn" : undefined} />
      </div>

      {/* Submit form */}
      <Card className="mt-6 border-bronze/30">
        <CardContent className="py-4">
          <form onSubmit={submit} className="space-y-3">
            <div>
              <Label htmlFor="url">URL of the post</Label>
              <Input id="url" type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://x.com/…  or  facebook.com/…" />
            </div>
            <div>
              <Label htmlFor="note">Why this matters (1 line)</Label>
              <Input id="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g., local MLA quote on bandh" />
            </div>
            <div>
              <Label>Screenshot — the main post</Label>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFile}
                className="mt-1 block w-full rounded-md border border-border bg-white px-2 py-1.5 text-sm file:mr-3 file:rounded file:border-0 file:bg-sand-deep file:px-2 file:py-1 file:text-xs"
              />
              {imageName && <div className="mt-1 text-[11px] text-muted">{imageName} attached · the desk OCRs it</div>}
            </div>

            {/* Extra screenshots — comment threads, reaction strips, reposts.
                These hugely boost intelligence value because the AI extracts
                voices and counter-voices from each. */}
            <div className="rounded-lg border border-dashed border-border bg-surface-2/40 p-2.5">
              <Label className="text-[11px]">More screenshots — comment thread, reactions, reposts (up to 4)</Label>
              <input
                ref={extraFileRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleExtraFiles}
                disabled={extraImages.length >= 4}
                className="mt-1 block w-full rounded-md border border-border bg-white px-2 py-1.5 text-xs file:mr-2 file:rounded file:border-0 file:bg-sand-deep file:px-2 file:py-0.5 file:text-[10px] disabled:opacity-50"
              />
              {extraImages.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {extraImages.map((x, i) => (
                    <li key={i} className="flex items-center justify-between rounded bg-white px-2 py-1 text-[11px]">
                      <span className="truncate text-muted">{x.name}</span>
                      <button type="button" onClick={() => removeExtra(i)} className="ml-2 text-severity-1 hover:underline">remove</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <Label htmlFor="comments_text" className="text-[12px]">Comments / reactions you saw (optional, super useful)</Label>
              <Textarea
                id="comments_text"
                value={commentsText}
                onChange={(e) => setCommentsText(e.target.value)}
                rows={3}
                placeholder='e.g., "Many supportive comments from Itanagar accounts. 3 hostile replies from a single Tezpur University handle. Top comment: \"This won&apos;t change anything\"."'
                className="mt-1 text-xs"
              />
              <p className="mt-0.5 text-[10px] text-muted">The desk AI scans this to extract who&apos;s reacting + how. Even a 1-line note helps.</p>
            </div>

            <Button type="submit" variant="bronze" disabled={busy} className="w-full">
              {busy ? "Sending…" : "Submit to desk"}
            </Button>
            <p className="text-center text-[10px] text-muted">
              Goes to the analyst queue. They review and accept within hours.
            </p>
          </form>
        </CardContent>
      </Card>

      {/* History */}
      <h2 className="mt-8 font-serif text-base font-bold text-navy">Recent submissions</h2>
      {submissions.length === 0 ? (
        <div className="mt-2 rounded border border-dashed border-border p-4 text-center text-xs text-muted">
          Nothing yet — send your first signal above.
        </div>
      ) : (
        <ul className="mt-2 space-y-2">
          {submissions.map((s) => (
            <li key={s.id} className="rounded border border-border bg-white p-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <StatusBadge status={s.status} />
                <span className="text-[10px] text-muted">{formatDistanceToNowStrict(new Date(s.created_at))} ago</span>
              </div>
              {s.url && <div className="mt-1 truncate text-[11px] text-navy">{s.url}</div>}
              {s.note && <div className="mt-1 italic text-muted">&ldquo;{s.note}&rdquo;</div>}
              {s.status === "rejected" && s.rejection_reason && (
                <div className="mt-1 rounded bg-severity-1/10 px-2 py-1 text-[11px] text-severity-1">
                  Why rejected: {s.rejection_reason}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6 text-center text-[10px] text-muted">
        Samvidya · Field v1
      </div>
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: "good" | "warn" }) {
  return (
    <div className="rounded border border-border bg-white p-2">
      <div className="text-[9px] uppercase tracking-wider text-muted">{label}</div>
      <div className={`numeric-callout text-lg ${tone === "good" ? "text-positive" : tone === "warn" ? "text-severity-1" : "text-navy"}`}>
        {value}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "accepted") return <Badge variant="positive">Accepted</Badge>;
  if (status === "rejected") return <Badge variant="negative">Rejected</Badge>;
  if (status === "needs_human") return <Badge variant="default">Reviewing</Badge>;
  return <Badge variant="default">Pending</Badge>;
}
