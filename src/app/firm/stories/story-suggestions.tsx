"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type Suggestion = {
  source_event_id: string;
  source_event_title: string;
  angle: string;
  why_now: string;
  draft_pitch: string;
  suggested_voice_name: string | null;
  suggested_outlet: string | null;
  district: string | null;
  constituency: string | null;
  snt_score: number;
};

export function StorySuggestions() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null);

  async function generate() {
    setBusy(true);
    const t = toast.loading("Scanning signals for story angles…");
    try {
      const r = await fetch("/api/stories/suggest", { method: "POST" });
      const j = await r.json();
      toast.dismiss(t);
      if (!r.ok || !j.ok) {
        toast.error(j.error ?? "Suggestion failed");
        setBusy(false);
        return;
      }
      setSuggestions(j.suggestions);
      setGeneratedAt(new Date());
      toast.success(`${j.suggestions.length} story angles · ${(j.ms / 1000).toFixed(1)}s`);
    } catch (e) {
      toast.dismiss(t);
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function dismiss(id: string) {
    setSuggestions((cur) => cur?.filter((s) => s.source_event_id !== id) ?? null);
  }

  if (!suggestions) {
    return (
      <Card className="mb-6 border-bronze/30 bg-gradient-to-br from-sand to-white">
        <CardContent className="flex items-center justify-between py-5">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-bronze">Analyst desk · AI</div>
            <h2 className="mt-1 font-serif text-xl font-bold text-navy">Story angles from today&apos;s signals</h2>
            <p className="mt-1 text-sm text-muted">
              The AI scans high-SNT events that aren&apos;t already in the pipeline and proposes angles, voices, and outlets. Edit before accepting.
            </p>
          </div>
          <Button onClick={generate} disabled={busy} variant="bronze">
            {busy ? "Thinking…" : "Generate suggestions"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-6 border-bronze/40">
      <CardContent className="py-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-bronze">Analyst desk · AI</div>
            <h2 className="mt-1 font-serif text-xl font-bold text-navy">Suggested story angles</h2>
            <p className="mt-1 text-xs text-muted">
              {generatedAt && <>Generated {generatedAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}.</>}
              {" "}Tweak the angle, swap the voice if needed, then Accept to drop it into Ideas.
            </p>
          </div>
          <Button onClick={generate} variant="ghost" size="sm" disabled={busy}>{busy ? "…" : "Regenerate"}</Button>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {suggestions.length === 0 && (
            <div className="lg:col-span-2 rounded border border-dashed border-border p-6 text-center text-sm text-muted">
              No suggestions right now — the model didn&apos;t find any signals worth pushing as stories.
            </div>
          )}
          {suggestions.map((s) => (
            <SuggestionCard
              key={s.source_event_id}
              s={s}
              onAccepted={() => { dismiss(s.source_event_id); router.refresh(); }}
              onDismiss={() => dismiss(s.source_event_id)}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function SuggestionCard({ s, onAccepted, onDismiss }: { s: Suggestion; onAccepted: () => void; onDismiss: () => void }) {
  const [angle, setAngle] = useState(s.angle);
  const [pitch, setPitch] = useState(s.draft_pitch);
  const [outlet, setOutlet] = useState(s.suggested_outlet ?? "");
  const [accepting, setAccepting] = useState(false);
  const angleEdited = angle.trim() !== s.angle.trim();
  const pitchEdited = pitch.trim() !== s.draft_pitch.trim();

  async function accept() {
    setAccepting(true);
    try {
      const r = await fetch("/api/stories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: angle,
          outlet: outlet.trim() || null,
          source_event_id: s.source_event_id,
          ai_angle: s.angle,
          ai_pitch: s.draft_pitch,
        }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Create failed");
      const edited = angleEdited || pitchEdited;
      toast.success(edited ? "Story added with your edits ✓" : "Story added as the AI suggested ✓");
      onAccepted();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setAccepting(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="text-[10px] uppercase tracking-wider text-muted">From signal · SNT {s.snt_score.toFixed(2)}</div>
        <button onClick={onDismiss} aria-label="Dismiss" className="text-muted hover:text-foreground">✕</button>
      </div>
      <div className="mt-1 line-clamp-2 text-xs italic text-muted">&ldquo;{s.source_event_title}&rdquo;</div>

      <div className="mt-3 flex flex-wrap gap-1 text-[10px]">
        {s.constituency && <Badge variant="default">{s.constituency}</Badge>}
        {!s.constituency && s.district && <Badge variant="default">{s.district}</Badge>}
        {s.suggested_voice_name && <Badge variant="bronze">via {s.suggested_voice_name}</Badge>}
      </div>

      <div className="mt-3">
        <label className="text-[10px] uppercase tracking-wider text-muted">Angle / headline</label>
        <Input value={angle} onChange={(e) => setAngle(e.target.value)} className="mt-1 text-sm" />
        {angleEdited && <div className="mt-1 text-[10px] text-bronze">Edited</div>}
      </div>

      <div className="mt-3">
        <label className="text-[10px] uppercase tracking-wider text-muted">Why now</label>
        <p className="mt-1 text-xs text-foreground/80">{s.why_now}</p>
      </div>

      <div className="mt-3">
        <label className="text-[10px] uppercase tracking-wider text-muted">Draft pitch to outlet</label>
        <Textarea value={pitch} onChange={(e) => setPitch(e.target.value)} className="mt-1 min-h-[64px] text-xs" />
        {pitchEdited && <div className="mt-1 text-[10px] text-bronze">Edited from AI draft</div>}
      </div>

      <div className="mt-3">
        <label className="text-[10px] uppercase tracking-wider text-muted">Outlet</label>
        <Input value={outlet} onChange={(e) => setOutlet(e.target.value)} className="mt-1 text-sm" placeholder="Pick an outlet (free text)" />
      </div>

      <div className="mt-3 flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onDismiss}>Dismiss</Button>
        <Button variant="bronze" size="sm" onClick={accept} disabled={accepting}>
          {accepting ? "Adding…" : "Add to Ideas"}
        </Button>
      </div>
    </div>
  );
}
