"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Markdown } from "@/components/markdown";
import { toast } from "sonner";
import { format } from "date-fns";

export default function CabinetAgenda() {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null);

  async function generate() {
    setBusy(true);
    setBody("");
    try {
      const r = await fetch("/api/agenda/generate", { method: "POST" });
      if (!r.ok || !r.body) {
        toast.error(`Generation failed: ${r.status}`);
        setBusy(false);
        return;
      }
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += dec.decode(value, { stream: true });
        const errMatch = buffer.match(/\[\[AGENDA_ERROR:([^\]]+)]]/);
        if (errMatch) toast.error(errMatch[1]);
        const cleaned = buffer.replace(/\n*\[\[AGENDA_ERROR:[^\]]+]]\n*/g, "");
        setBody(cleaned);
      }
      setGeneratedAt(new Date());
      setBusy(false);
      toast.success("Agenda ready");
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="container mx-auto max-w-4xl px-6 py-10">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-bronze">Cabinet meeting prep · gpt-4o</div>
          <h1 className="mt-2 font-serif text-3xl font-bold text-navy">Weekly cabinet agenda</h1>
          <p className="mt-1 text-sm text-muted">Reads the past 7 days of signals + alerts and produces a one-page agenda. Decisions, discussions, info, public actions — clearly separated.</p>
        </div>
        <Button variant="bronze" onClick={generate} disabled={busy}>
          {busy ? "Generating…" : body ? "Regenerate" : "Generate this week's agenda"}
        </Button>
      </div>

      <Card className="mt-6">
        <CardContent className="p-6">
          {!body && !busy && (
            <div className="rounded border border-dashed border-border p-8 text-center text-sm text-muted">
              Click <span className="font-medium text-navy">Generate this week&apos;s agenda</span> above. Streams in 8–15 seconds.
            </div>
          )}
          {body && (
            <>
              {generatedAt && (
                <div className="mb-3 text-xs text-muted">
                  Generated {format(generatedAt, "EEE d MMM, HH:mm")} · {Math.round(body.length / 5)} words · model gpt-4o
                </div>
              )}
              <Markdown source={body} className="prose prose-sm max-w-none font-serif leading-relaxed" />
            </>
          )}
          {busy && body === "" && (
            <div className="animate-pulse rounded border border-border bg-sand/40 p-4 text-sm text-muted">
              Reading the week&apos;s signals + alerts…
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
