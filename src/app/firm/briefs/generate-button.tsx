"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function GenerateBriefButton() {
  const router = useRouter();
  const [streaming, setStreaming] = useState(false);
  const [text, setText] = useState("");
  const [briefId, setBriefId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function start() {
    setStreaming(true);
    setText("");
    setBriefId(null);
    setOpen(true);
    try {
      const r = await fetch("/api/briefs/generate", { method: "POST" });
      if (!r.ok || !r.body) {
        toast.error(`Generation failed: ${r.status}`);
        setStreaming(false);
        return;
      }
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const piece = dec.decode(value, { stream: true });
        buffer += piece;
        // Detect terminal markers
        const idMatch = buffer.match(/\[\[BRIEF_ID:([0-9a-f-]+)]]/);
        const errMatch = buffer.match(/\[\[BRIEF_ERROR:([^\]]+)]]/);
        if (idMatch) setBriefId(idMatch[1]);
        if (errMatch) toast.error(`Brief save: ${errMatch[1]}`);
        // Strip markers from displayed text
        const cleaned = buffer.replace(/\n*\[\[BRIEF_(ID|ERROR):[^\]]+]]\n*/g, "");
        setText(cleaned);
      }
      setStreaming(false);
      toast.success("Draft ready");
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
      setStreaming(false);
    }
  }

  function close() {
    setOpen(false);
    setText("");
    setBriefId(null);
  }

  return (
    <>
      <Button variant="bronze" onClick={start} disabled={streaming}>
        {streaming ? "Generating…" : "Generate today's brief"}
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-deep/40 p-4" onClick={() => !streaming && close()}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-border bg-white shadow-sm"
          >
            <div className="flex items-center justify-between border-b border-border bg-sand px-5 py-3">
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-bronze">Streaming · live brief</div>
                <h3 className="font-serif text-base font-bold text-navy">Today&apos;s draft</h3>
              </div>
              <div className="flex items-center gap-3">
                {streaming && <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-bronze" aria-label="streaming" />}
                {!streaming && briefId && (
                  <Button size="sm" onClick={() => { router.push(`/firm/briefs/${briefId}`); }}>Open editor →</Button>
                )}
                <button onClick={close} disabled={streaming} className="text-muted hover:text-foreground disabled:opacity-50" aria-label="Close">✕</button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <div className="prose prose-sm max-w-none whitespace-pre-wrap font-serif leading-relaxed">{text || (streaming ? "Loading context…" : "")}</div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
