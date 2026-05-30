"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { toast } from "sonner";

type Kind = "bug" | "idea" | "praise" | "other";

const KIND_LABEL: Record<Kind, string> = {
  bug: "🐛 Bug",
  idea: "💡 Idea",
  praise: "🎉 Working well",
  other: "💬 Other",
};

/**
 * Floating "Send feedback" button — pinned bottom-right on every signed-in
 * page. Opens a small modal with kind picker + free text. Posts to
 * /api/feedback which writes to the `feedback` table. Superadmin can read
 * the queue at /super/feedback (TODO — for now they query Supabase directly).
 *
 * Why this matters: the news-pipeline bug went undetected for weeks because
 * there was no path for a user to flag friction. This adds that path
 * universally — analysts, ministers, interns, everyone.
 */
export function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>("bug");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const pathname = usePathname();

  async function send() {
    if (message.trim().length < 3) {
      toast.error("Tell us a bit more — at least a sentence.");
      return;
    }
    setSending(true);
    try {
      const r = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, message: message.trim(), page: pathname }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) { toast.error(j.error ?? "Couldn't send — try again."); return; }
      toast.success("Thanks — passed to the dev desk.");
      setOpen(false);
      setMessage("");
      setKind("bug");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Report a bug or share an idea"
        className="fixed bottom-4 right-4 z-40 flex h-11 items-center gap-2 rounded-full border border-border bg-white px-4 text-[12px] font-medium text-navy shadow-soft-lg transition hover:border-bronze hover:bg-bronze-soft hover:text-bronze-dark"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
        </svg>
        Feedback
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-end bg-navy/20 p-4 sm:items-center sm:justify-center" onClick={() => setOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl border border-border bg-white p-5 shadow-soft-lg">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-bronze">Tell the dev desk</div>
                <h2 className="mt-1 font-serif text-lg font-bold text-navy">What&apos;s on your mind?</h2>
              </div>
              <button onClick={() => setOpen(false)} aria-label="Close" className="text-muted hover:text-foreground">✕</button>
            </div>

            <div className="mt-4 flex flex-wrap gap-1.5">
              {(Object.entries(KIND_LABEL) as [Kind, string][]).map(([k, l]) => (
                <button
                  key={k}
                  onClick={() => setKind(k)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium ${
                    kind === k ? "border-bronze bg-bronze-soft text-bronze-dark" : "border-border bg-white text-muted hover:bg-surface-2"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>

            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              autoFocus
              placeholder={
                kind === "bug" ? "What broke? What were you doing?" :
                kind === "idea" ? "What would help you do your job better?" :
                kind === "praise" ? "What's working well? Helps us not break it." :
                "What do you want to tell us?"
              }
              className="mt-3 w-full resize-none"
            />

            <div className="mt-3 flex items-center justify-between">
              <div className="text-[10px] text-muted">Sent with your role + the current page so the team can reproduce.</div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={sending}>Cancel</Button>
                <Button variant="bronze" size="sm" onClick={send} disabled={sending}>
                  {sending ? "Sending…" : "Send"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
