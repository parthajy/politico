"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNowStrict } from "date-fns";
import { toast } from "sonner";

export type QueueRow = {
  id: string;
  url: string | null;
  screenshot_url: string | null;
  note: string | null;
  platform: string | null;
  extract_quality: string | null;
  ai_title: string | null;
  ai_body: string | null;
  ai_classification: Record<string, unknown> | null;
  status: string;
  created_at: string;
  ocr_caption: string | null;
  extra_screenshot_urls: string[] | null;  // additional screenshots — comment threads, reactions
  comments_text: string | null;            // volunteer's free-form note on observed reactions
  submitter: { name: string; role: string; photo_url: string | null; district: string | null } | null;
};

export function QueueClient({ rows, districts }: { rows: QueueRow[]; districts: { id: number; name: string }[] }) {
  const [items, setItems] = useState(rows);

  function remove(id: string) {
    setItems((cur) => cur.filter((r) => r.id !== id));
  }

  return (
    <ul className="space-y-4">
      {items.map((r) => <QueueCard key={r.id} r={r} districts={districts} onDone={() => remove(r.id)} />)}
    </ul>
  );
}

function QueueCard({ r, districts, onDone }: { r: QueueRow; districts: { id: number; name: string }[]; onDone: () => void }) {
  const router = useRouter();
  // AI-first state — pre-fill from AI's pass
  const [title, setTitle] = useState(r.ai_title ?? "");
  const [body, setBody] = useState(r.ai_body ?? r.ocr_caption ?? "");
  const [districtId, setDistrictId] = useState<string>("");
  const [internNotes, setInternNotes] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [busy, setBusy] = useState<"accept" | "reject" | null>(null);

  const cls = (r.ai_classification ?? {}) as { snt_score?: number; sentiment?: number; district?: string; constituency?: string };
  const sntStr = cls.snt_score != null ? (cls.snt_score as number).toFixed(2) : null;
  const sentStr = cls.sentiment != null ? (cls.sentiment as number).toFixed(2) : null;
  const blocked = r.extract_quality === "empty" || r.status === "needs_human";

  async function accept() {
    if (!title.trim() || !body.trim()) {
      toast.error("Title and content are required");
      return;
    }
    setBusy("accept");
    try {
      const res = await fetch(`/api/queue/${r.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "accept",
          title, body,
          url: r.url,
          district_id: districtId ? parseInt(districtId, 10) : null,
          intern_notes: internNotes || null,
          // Pass through the volunteer's extra intelligence so the voice
          // extractor sees it.
          comments_text: r.comments_text || null,
          extra_screenshot_urls: r.extra_screenshot_urls ?? [],
        }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error ?? "Accept failed");
      toast.success("Accepted into inbox");
      onDone();
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function reject() {
    if (!rejectReason.trim()) {
      toast.error("Provide a reason");
      return;
    }
    setBusy("reject");
    try {
      const res = await fetch(`/api/queue/${r.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", reason: rejectReason }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error ?? "Reject failed");
      toast.success("Rejected");
      onDone();
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <li className={`rounded-lg border p-4 ${blocked ? "border-bronze/40 bg-bronze/5" : "border-border bg-white"}`}>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          {r.submitter?.photo_url ? (
            <img src={r.submitter.photo_url} alt="" className="h-7 w-7 rounded-full object-cover" />
          ) : (
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-sand-deep text-[10px] font-bold text-navy">
              {(r.submitter?.name ?? "?").split(/\s+/).slice(0, 2).map((s) => s[0]?.toUpperCase()).join("")}
            </div>
          )}
          <div>
            <div className="text-sm font-medium text-navy">
              {r.submitter?.name ?? "Unknown"}
              <span className="text-[11px] font-normal text-muted"> · {r.submitter?.role === "volunteer" ? "field" : r.submitter?.role}</span>
            </div>
            <div className="text-[11px] text-muted">
              {r.submitter?.district ?? "no district"} · {formatDistanceToNowStrict(new Date(r.created_at))} ago
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {r.platform && <Badge variant="default">{r.platform}</Badge>}
          {r.extract_quality && (
            <Badge variant={r.extract_quality === "good" ? "positive" : r.extract_quality === "thin" ? "default" : "negative"}>
              extract: {r.extract_quality}
            </Badge>
          )}
          {sntStr && <Badge variant="navy">AI SNT {sntStr}</Badge>}
          {cls.district && <Badge variant="default">{String(cls.district)}</Badge>}
        </div>
      </div>

      {/* URL + note from volunteer */}
      <div className="mt-3 space-y-1.5 text-xs">
        {r.url && (
          <div>
            <span className="text-muted">URL: </span>
            <a href={r.url} target="_blank" rel="noreferrer" className="break-all text-bronze underline">{r.url}</a>
          </div>
        )}
        {r.note && (
          <div>
            <span className="text-muted">Volunteer note: </span>
            <span className="italic text-foreground/85">&ldquo;{r.note}&rdquo;</span>
          </div>
        )}
        {r.ocr_caption && (
          <div>
            <span className="text-muted">Screenshot reads: </span>
            <span className="text-foreground/85">{r.ocr_caption}</span>
          </div>
        )}
        {r.comments_text && (
          <div className="rounded-lg border-l-2 border-bronze bg-bronze-soft/40 p-2.5">
            <span className="text-[10px] font-medium uppercase tracking-wider text-bronze-dark">Comments / reactions volunteer observed</span>
            <p className="mt-1 whitespace-pre-wrap italic text-foreground/85">{r.comments_text}</p>
          </div>
        )}
        {(r.extra_screenshot_urls?.length ?? 0) > 0 && (
          <div>
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted">
              {r.extra_screenshot_urls!.length} extra screenshot{r.extra_screenshot_urls!.length === 1 ? "" : "s"}
            </span>
            <div className="mt-1 flex flex-wrap gap-2">
              {r.extra_screenshot_urls!.map((u, i) => (
                <a key={i} href={u} target="_blank" rel="noreferrer" className="block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u} alt={`extra ${i + 1}`} className="h-20 w-20 rounded border border-border object-cover hover:border-bronze" />
                </a>
              ))}
            </div>
          </div>
        )}
      </div>

      {blocked && (
        <div className="mt-3 rounded border border-bronze/40 bg-white p-2 text-xs text-bronze-dark">
          <span className="font-medium">Needs human:</span> AI couldn&apos;t extract the post content from this URL.
          Open it in your logged-in browser, paste the title + content below, then accept.
        </div>
      )}

      {/* Triage form — pre-filled if AI got it */}
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="md:col-span-2">
          <Label htmlFor={`t-${r.id}`}>Title</Label>
          <Input id={`t-${r.id}`} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Headline / post first line" />
        </div>
        <div className="md:col-span-2">
          <Label htmlFor={`b-${r.id}`}>Content</Label>
          <Textarea id={`b-${r.id}`} value={body} onChange={(e) => setBody(e.target.value)} className="min-h-[100px]" placeholder="Paste the post text here. Include author handle, mentions, hashtags." />
        </div>
        <div>
          <Label htmlFor={`d-${r.id}`}>District tag</Label>
          <select id={`d-${r.id}`} value={districtId} onChange={(e) => setDistrictId(e.target.value)} className="mt-1 block h-9 w-full rounded-md border border-border bg-white px-2 text-sm">
            <option value="">— let the classifier decide —</option>
            {districts.map((d) => <option key={d.id} value={String(d.id)}>{d.name}</option>)}
          </select>
        </div>
        <div>
          <Label htmlFor={`n-${r.id}`}>Your note</Label>
          <Input id={`n-${r.id}`} value={internNotes} onChange={(e) => setInternNotes(e.target.value)} placeholder="Anything the analyst should know" />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        {sentStr && (
          <div className="text-[11px] text-muted">
            AI&apos;s first pass: sentiment {sentStr}{cls.district ? ` · district ${cls.district}` : ""}
          </div>
        )}
        <div className="ml-auto flex gap-2">
          {!rejecting && (
            <>
              <Button size="sm" variant="ghost" onClick={() => setRejecting(true)} disabled={!!busy}>Reject</Button>
              <Button size="sm" variant="bronze" onClick={accept} disabled={!!busy}>{busy === "accept" ? "Accepting…" : "Accept → inbox"}</Button>
            </>
          )}
          {rejecting && (
            <>
              <Input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Reason (visible to volunteer)" className="w-64" />
              <Button size="sm" variant="ghost" onClick={() => setRejecting(false)} disabled={!!busy}>Cancel</Button>
              <Button size="sm" variant="danger" onClick={reject} disabled={!!busy}>{busy === "reject" ? "…" : "Confirm reject"}</Button>
            </>
          )}
        </div>
      </div>
    </li>
  );
}
