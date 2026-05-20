"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

type Rec = {
  event_id: string;
  bucket: "escalate" | "watch" | "story" | "noise";
  why: string;
  action_note: string;
  title: string;
  snt_score: number | null;
  sentiment: number | null;
  district: string | null;
  constituency: string | null;
  triage_status: string;
  source: string;
};

const BUCKETS: Rec["bucket"][] = ["escalate", "story", "watch", "noise"];

const BUCKET_LABEL: Record<Rec["bucket"], { label: string; help: string; color: string }> = {
  escalate: { label: "Escalate now", help: "Time-sensitive. CMO needs to know.", color: "var(--severity-1)" },
  story:    { label: "Convert to story", help: "Lead the narrative — brief an outlet.", color: "var(--bronze)" },
  watch:    { label: "Watch list", help: "Monitor, don't act yet.", color: "var(--muted)" },
  noise:    { label: "Likely noise", help: "Logged for audit; close.", color: "#9CA3AF" },
};

export function TodaysCall() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [recs, setRecs] = useState<Rec[] | null>(null);
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null);

  async function generate() {
    setBusy(true);
    const t = toast.loading("Reading the inbox…");
    try {
      const r = await fetch("/api/inbox/recommend", { method: "POST" });
      const j = await r.json();
      toast.dismiss(t);
      if (!r.ok || !j.ok) {
        toast.error(j.error ?? "AI recommendation failed");
        setBusy(false);
        return;
      }
      setRecs(j.recommendations);
      setGeneratedAt(new Date());
      toast.success(`${j.recommendations.length} recommendations · ${(j.ms / 1000).toFixed(1)}s`);
    } catch (e) {
      toast.dismiss(t);
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!recs) {
    return (
      <Card className="mt-6 border-bronze/30 bg-gradient-to-br from-sand to-white">
        <CardContent className="flex items-center justify-between py-5">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-bronze">Analyst desk · AI</div>
            <h2 className="mt-1 font-serif text-xl font-bold text-navy">Today&apos;s call</h2>
            <p className="mt-1 text-sm text-muted">
              Have the AI rank the top 25 signals into <em>escalate / story / watch / noise</em> with one-line action notes you can edit before acting.
            </p>
          </div>
          <Button onClick={generate} disabled={busy} variant="bronze">
            {busy ? "Thinking…" : "Generate recommendations"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const grouped: Record<Rec["bucket"], Rec[]> = { escalate: [], story: [], watch: [], noise: [] };
  for (const r of recs) grouped[r.bucket].push(r);

  return (
    <Card className="mt-6 border-bronze/40">
      <CardContent className="py-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-bronze">Analyst desk · AI</div>
            <h2 className="mt-1 font-serif text-xl font-bold text-navy">Today&apos;s call</h2>
            <p className="mt-1 text-xs text-muted">
              {generatedAt && <>Generated {generatedAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}.</>}
              {" "}Edit the note, then act. Each action records what the AI suggested and what you changed.
            </p>
          </div>
          <Button onClick={generate} variant="ghost" size="sm" disabled={busy}>{busy ? "…" : "Regenerate"}</Button>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-4">
          {BUCKETS.map((b) => (
            <BucketCol
              key={b}
              bucket={b}
              recs={grouped[b]}
              router={router}
              onChange={(updated) => setRecs((cur) => cur?.map((r) => (r.event_id === updated.event_id ? updated : r)) ?? null)}
              onActionTaken={(eventId) => setRecs((cur) => cur?.filter((r) => r.event_id !== eventId) ?? null)}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function BucketCol({ bucket, recs, router, onChange, onActionTaken }: {
  bucket: Rec["bucket"]; recs: Rec[]; router: ReturnType<typeof useRouter>;
  onChange: (r: Rec) => void; onActionTaken: (eventId: string) => void;
}) {
  const meta = BUCKET_LABEL[bucket];
  return (
    <div className="rounded-md border border-border bg-sand-deep/30 p-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-bold uppercase tracking-wider" style={{ color: meta.color }}>{meta.label}</div>
        <span className="text-xs text-muted">{recs.length}</span>
      </div>
      <p className="mt-0.5 text-[11px] text-muted">{meta.help}</p>
      <div className="mt-3 space-y-3">
        {recs.length === 0 && (
          <div className="rounded border border-dashed border-border p-3 text-center text-[11px] text-muted">none</div>
        )}
        {recs.map((r) => (
          <RecCard
            key={r.event_id}
            r={r}
            onChange={onChange}
            onActionTaken={() => { onActionTaken(r.event_id); router.refresh(); }}
          />
        ))}
      </div>
    </div>
  );
}

function RecCard({ r, onChange, onActionTaken }: { r: Rec; onChange: (r: Rec) => void; onActionTaken: () => void }) {
  const [note, setNote] = useState(r.action_note);
  const [acting, setActing] = useState<string | null>(null);
  const dirty = note.trim() !== r.action_note.trim();

  async function act(action: "escalate" | "monitoring" | "close" | "story") {
    setActing(action);
    try {
      if (action === "escalate" || action === "monitoring" || action === "close") {
        const status = action === "escalate" ? "escalated" : action === "monitoring" ? "monitoring" : "closed";
        const res = await fetch("/api/triage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event_id: r.event_id,
            status,
            notes: note,
            ai_suggested_bucket: r.bucket,
            ai_suggested_note: r.action_note,
          }),
        });
        const j = await res.json();
        if (!res.ok || !j.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      } else if (action === "story") {
        const res = await fetch("/api/stories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: `[Story] ${r.title.slice(0, 120)}` }),
        });
        const j = await res.json();
        if (!res.ok || !j.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      toast.success(
        dirty
          ? `${actionLabel(action)} with your edit ✓`
          : `${actionLabel(action)} as the AI suggested ✓`
      );
      onActionTaken();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setActing(null);
    }
  }

  return (
    <div className="rounded border border-border bg-white p-2.5">
      <div className="line-clamp-2 text-[12px] font-medium text-navy">{r.title}</div>
      <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] text-muted">
        {r.snt_score != null && <Badge variant="default">SNT {r.snt_score.toFixed(2)}</Badge>}
        {r.constituency && <span>{r.constituency}</span>}
        {!r.constituency && r.district && <span>{r.district}</span>}
      </div>
      <div className="mt-2 text-[11px] italic text-muted">&ldquo;{r.why}&rdquo;</div>
      <Textarea
        value={note}
        onChange={(e) => { setNote(e.target.value); onChange({ ...r, action_note: e.target.value }); }}
        className="mt-2 min-h-[52px] text-[11px] leading-snug"
      />
      {dirty && <div className="mt-1 text-[10px] text-bronze">Edited from AI suggestion</div>}
      <div className="mt-2 flex flex-wrap gap-1">
        {r.bucket === "escalate" && (
          <button onClick={() => act("escalate")} disabled={!!acting} className="rounded bg-severity-1 px-2 py-1 text-[10px] text-white disabled:opacity-50">
            {acting === "escalate" ? "…" : "Escalate"}
          </button>
        )}
        {r.bucket === "story" && (
          <button onClick={() => act("story")} disabled={!!acting} className="rounded bg-bronze px-2 py-1 text-[10px] text-white disabled:opacity-50">
            {acting === "story" ? "…" : "Create story"}
          </button>
        )}
        {(r.bucket === "watch" || r.bucket === "story") && (
          <button onClick={() => act("monitoring")} disabled={!!acting} className="rounded border border-border bg-white px-2 py-1 text-[10px] text-muted hover:bg-sand disabled:opacity-50">
            {acting === "monitoring" ? "…" : "Monitor"}
          </button>
        )}
        {r.bucket === "noise" && (
          <button onClick={() => act("close")} disabled={!!acting} className="rounded border border-border bg-white px-2 py-1 text-[10px] text-muted hover:bg-sand disabled:opacity-50">
            {acting === "close" ? "…" : "Close"}
          </button>
        )}
      </div>
    </div>
  );
}

function actionLabel(a: string) {
  if (a === "escalate") return "Escalated";
  if (a === "monitoring") return "Marked monitoring";
  if (a === "close") return "Closed";
  if (a === "story") return "Story idea created";
  return "Done";
}
