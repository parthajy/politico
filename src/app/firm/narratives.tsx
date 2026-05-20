"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type KeyEvent = { event_id: string; title: string; constituency: string | null; district: string | null; sentiment: number | null };
type Narrative = {
  label: string;
  summary: string;
  sentiment_lean: "hostile" | "mixed" | "supportive";
  trajectory: "rising" | "steady" | "fading";
  recommended_response: string;
  key_events: KeyEvent[];
};

export function Narratives() {
  const [busy, setBusy] = useState(false);
  const [narratives, setNarratives] = useState<Narrative[] | null>(null);
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null);

  async function generate() {
    setBusy(true);
    const t = toast.loading("AI clustering 7 days of signals…");
    try {
      const r = await fetch("/api/narratives", { method: "POST" });
      const j = await r.json();
      toast.dismiss(t);
      if (!r.ok || !j.ok) {
        toast.error(j.error ?? "Narrative detection failed");
        setBusy(false);
        return;
      }
      setNarratives(j.narratives);
      setGeneratedAt(new Date());
      toast.success(`${j.narratives.length} narratives · ${(j.ms / 1000).toFixed(1)}s`);
    } catch (e) {
      toast.dismiss(t);
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!narratives) {
    return (
      <Card className="mt-6 border-bronze/30 bg-gradient-to-br from-sand to-white">
        <CardContent className="flex items-center justify-between py-5">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-bronze">Analyst desk · AI</div>
            <h2 className="mt-1 font-serif text-xl font-bold text-navy">Forming narratives</h2>
            <p className="mt-1 text-sm text-muted">
              Cluster the last 7 days of signals into 3-6 storylines forming across multiple events. Each carries a sentiment lean, trajectory, and response recommendation.
            </p>
          </div>
          <Button onClick={generate} disabled={busy} variant="bronze">
            {busy ? "Clustering…" : "Detect narratives"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mt-6 border-bronze/40">
      <CardContent className="py-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-bronze">Analyst desk · AI</div>
            <h2 className="mt-1 font-serif text-xl font-bold text-navy">Forming narratives</h2>
            <p className="mt-1 text-xs text-muted">
              {generatedAt && <>Generated {generatedAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}.</>}
              {" "}Clusters signals into storylines you can actually act on.
            </p>
          </div>
          <Button onClick={generate} variant="ghost" size="sm" disabled={busy}>{busy ? "…" : "Regenerate"}</Button>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {narratives.length === 0 && (
            <div className="lg:col-span-2 rounded border border-dashed border-border p-6 text-center text-sm text-muted">
              No coherent narratives detected yet — week is too quiet.
            </div>
          )}
          {narratives.map((n, i) => (
            <NarrativeCard key={i} n={n} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function NarrativeCard({ n }: { n: Narrative }) {
  const leanColor = n.sentiment_lean === "hostile" ? "var(--severity-1)" : n.sentiment_lean === "supportive" ? "var(--positive)" : "var(--bronze)";
  return (
    <div className="rounded-lg border border-border bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-serif text-base font-bold text-navy">{n.label}</h3>
        <div className="flex flex-col items-end gap-0.5">
          <Badge variant={n.sentiment_lean === "hostile" ? "negative" : n.sentiment_lean === "supportive" ? "positive" : "default"}>{n.sentiment_lean}</Badge>
          <span className="text-[10px] text-muted">{n.trajectory === "rising" ? "↑" : n.trajectory === "fading" ? "↓" : "→"} {n.trajectory}</span>
        </div>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-foreground/85">{n.summary}</p>

      <div className="mt-3 rounded border-l-2 bg-sand-deep/30 p-2" style={{ borderLeftColor: leanColor }}>
        <div className="text-[10px] uppercase tracking-wider text-muted">Recommended response</div>
        <p className="mt-0.5 text-xs">{n.recommended_response}</p>
      </div>

      {n.key_events.length > 0 && (
        <div className="mt-3">
          <div className="text-[10px] uppercase tracking-wider text-muted">Anchor signals ({n.key_events.length})</div>
          <ul className="mt-1 space-y-1">
            {n.key_events.slice(0, 3).map((e) => (
              <li key={e.event_id} className="line-clamp-1 text-[11px] text-muted">
                · {e.title} {e.constituency ? <span className="text-navy">({e.constituency})</span> : null}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
