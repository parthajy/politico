"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type Citation = { event_id: string; title: string; source: string; published_at: string | null; url: string | null; constituency: string | null; district: string | null };
type Answer = { answer: string; cited_event_ids: string[]; confidence: "high" | "medium" | "low"; no_data_caveat: string | null; citations: Citation[]; ms: number };

const SUGGESTIONS = [
  "What's happening with the Siang dam this week?",
  "Which districts have the most negative coverage?",
  "What's driving the bandh in Itanagar?",
  "Show me everything on the CBI probe.",
];

export function AskDesk() {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [a, setA] = useState<Answer | null>(null);

  async function ask(question: string) {
    setBusy(true);
    setA(null);
    try {
      const r = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        toast.error(j.error ?? "Ask failed");
        setBusy(false);
        return;
      }
      setA(j);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim() || busy) return;
    ask(q.trim());
  }

  return (
    <Card className="border-bronze/40">
      <CardContent className="py-5">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-bronze">Ask the desk · gpt-4o</div>
            <h2 className="mt-1 font-serif text-xl font-bold text-navy">What do you want to know?</h2>
            <p className="mt-1 text-xs text-muted">Plain-English question. Answer cites the actual signals it&apos;s based on.</p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="mt-4 flex gap-2">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="e.g., what's the latest on hydropower opposition?"
            disabled={busy}
            className="flex-1"
          />
          <Button type="submit" disabled={busy || !q.trim()}>
            {busy ? "Asking…" : "Ask"}
          </Button>
        </form>

        {!a && !busy && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            <span className="text-[11px] text-muted">Try:</span>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => { setQ(s); ask(s); }}
                disabled={busy}
                className="rounded-full border border-border bg-white px-2.5 py-0.5 text-[11px] text-muted hover:border-bronze hover:text-bronze"
              >{s}</button>
            ))}
          </div>
        )}

        {busy && (
          <div className="mt-4 animate-pulse rounded border border-border bg-sand/40 p-4 text-sm text-muted">
            Reading the last 14 days of signals…
          </div>
        )}

        {a && (
          <div className="mt-4 space-y-3">
            <div className="rounded-lg border border-border bg-sand/40 p-4">
              <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-muted">
                <span>Answer</span>
                <span>
                  <Badge variant={a.confidence === "high" ? "positive" : a.confidence === "low" ? "negative" : "default"}>{a.confidence} confidence</Badge>
                  <span className="ml-2">{(a.ms / 1000).toFixed(1)}s</span>
                </span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-foreground">{a.answer}</p>
              {a.no_data_caveat && (
                <p className="mt-2 text-xs italic text-bronze">{a.no_data_caveat}</p>
              )}
            </div>

            {a.citations.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted">Cited signals ({a.citations.length})</div>
                <ul className="mt-1.5 space-y-1.5">
                  {a.citations.map((c) => (
                    <li key={c.event_id} className="rounded border border-border bg-white p-2 text-xs">
                      <div className="font-medium text-navy">
                        {c.url ? <a href={c.url} target="_blank" rel="noreferrer" className="hover:underline">{c.title}</a> : c.title}
                      </div>
                      <div className="text-[10px] text-muted">
                        {c.source}
                        {c.constituency && <> · {c.constituency}</>}
                        {!c.constituency && c.district && <> · {c.district}</>}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
