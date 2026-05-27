"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { sntBadge, sentimentColor } from "@/lib/format";
import { toast } from "sonner";

type Result = {
  event_id: string;
  title: string;
  snt_score: number | null;
  sentiment: number | null;
  district: string | null;
  constituency: string | null;
  topic_tags: string[];
  sentiment_justification: string | null;
  ocr_caption: string | null;
  ms: number;
};

export function IntakeForm({ districts }: { districts: { id: number; name: string }[] }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [districtId, setDistrictId] = useState<string>("");
  const [volunteer, setVolunteer] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageName, setImageName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  function reset() {
    setUrl(""); setNote(""); setDistrictId(""); setVolunteer("");
    setImageDataUrl(null); setImageName(null); setResult(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) {
      toast.error("Image must be under 8 MB");
      return;
    }
    const buf = await f.arrayBuffer();
    const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
    setImageDataUrl(`data:${f.type};base64,${b64}`);
    setImageName(f.name);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim() && !imageDataUrl) {
      toast.error("Paste a URL or attach a screenshot");
      return;
    }
    setBusy(true);
    setResult(null);
    const t = toast.loading(imageDataUrl && url.trim() ? "Fetching URL + OCR…" : imageDataUrl ? "Reading screenshot…" : "Fetching URL…");
    try {
      const r = await fetch("/api/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url.trim() || undefined,
          note: note.trim() || undefined,
          district_id: districtId ? parseInt(districtId, 10) : null,
          volunteer_name: volunteer.trim() || undefined,
          image_data_url: imageDataUrl ?? undefined,
        }),
      });
      const j = await r.json();
      toast.dismiss(t);
      if (!r.ok || !j.ok) {
        toast.error(j.error ?? "Submission failed");
        return;
      }
      setResult(j);
      toast.success(`Added to inbox · ${(j.ms / 1000).toFixed(1)}s`);
      router.refresh();
    } catch (err) {
      toast.dismiss(t);
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const snt = result?.snt_score != null ? sntBadge(result.snt_score) : null;

  return (
    <div>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <Label htmlFor="url">URL</Label>
          <Input
            id="url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://twitter.com/… or https://facebook.com/… or any news article"
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="note">Why this matters (1 line)</Label>
            <Input
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g., Local opposition leader naming Mama Natung"
            />
          </div>
          <div>
            <Label htmlFor="vol">Volunteer name (if from field)</Label>
            <Input
              id="vol"
              value={volunteer}
              onChange={(e) => setVolunteer(e.target.value)}
              placeholder="optional"
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="dist">Likely district (optional)</Label>
            <select
              id="dist"
              value={districtId}
              onChange={(e) => setDistrictId(e.target.value)}
              className="mt-1 block h-9 w-full rounded-md border border-border bg-white px-2 text-sm"
            >
              <option value="">— let the classifier decide —</option>
              {districts.map((d) => (
                <option key={d.id} value={String(d.id)}>{d.name}</option>
              ))}
            </select>
          </div>
          <div>
            <Label>Screenshot (optional — for FB / IG / X posts)</Label>
            <div className="mt-1 flex items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleFile}
                className="block w-full rounded-md border border-border bg-white px-2 py-1.5 text-sm file:mr-3 file:rounded file:border-0 file:bg-sand file:px-2 file:py-1 file:text-xs"
              />
            </div>
            {imageName && <div className="mt-1 text-[11px] text-muted">{imageName} attached · OCR runs server-side</div>}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 pt-2">
          <p className="text-[11px] text-muted">
            URL is fetched server-side, content extracted via OG tags. Screenshot is OCR-ed. Both are then classified and dropped into the inbox tagged <code className="font-mono text-foreground">source: manual</code>.
          </p>
          <div className="flex gap-2">
            {result && <Button type="button" variant="ghost" onClick={reset}>Submit another</Button>}
            <Button type="submit" variant="bronze" disabled={busy}>
              {busy ? "Working…" : "Submit to inbox"}
            </Button>
          </div>
        </div>
      </form>

      {result && (
        <div className="mt-6 rounded-lg border border-positive/40 bg-positive/5 p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {snt && <Badge variant={snt.variant}>{snt.label}</Badge>}
              <div className="text-xs text-muted">classified · {(result.ms / 1000).toFixed(1)}s</div>
            </div>
            <Link href="/firm" className="text-xs text-bronze underline">Open in inbox →</Link>
          </div>

          <div className="mt-2 font-medium text-navy">{result.title}</div>

          <div className="mt-3 grid grid-cols-2 gap-3 text-xs md:grid-cols-4">
            <KV label="SNT" value={result.snt_score != null ? result.snt_score.toFixed(2) : "—"} />
            <KV label="Sentiment" value={result.sentiment != null ? result.sentiment.toFixed(2) : "—"} dotColor={sentimentColor(result.sentiment)} />
            <KV label="District" value={result.district ?? "—"} />
            <KV label="Constituency" value={result.constituency ?? "—"} />
          </div>

          {result.sentiment_justification && (
            <div className="mt-3 text-xs text-foreground/85">
              <span className="text-muted">Why this score: </span>
              {result.sentiment_justification}
            </div>
          )}

          {result.topic_tags?.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {result.topic_tags.map((t) => (
                <span key={t} className="rounded bg-sand-deep px-1.5 py-0.5 text-[10px] text-muted">{t}</span>
              ))}
            </div>
          )}

          {result.ocr_caption && (
            <div className="mt-3 border-t border-border/50 pt-2 text-[11px] italic text-muted">
              Screenshot read: {result.ocr_caption}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function KV({ label, value, dotColor }: { label: string; value: string; dotColor?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted">{label}</div>
      <div className="mt-0.5 flex items-center gap-1 text-sm text-navy">
        {dotColor && <span className="h-2 w-2 rounded-full" style={{ background: dotColor }} />}
        <span>{value}</span>
      </div>
    </div>
  );
}
