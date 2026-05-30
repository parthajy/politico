"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Hit = {
  kind: "person" | "constituency" | "district" | "topic" | "event" | "narrative";
  label: string;
  sub?: string;
  href: string;
};

const KIND_LABEL: Record<Hit["kind"], string> = {
  person: "Person",
  constituency: "Constituency",
  district: "District",
  topic: "Topic",
  event: "Event",
  narrative: "Narrative",
};

const KIND_ICON: Record<Hit["kind"], string> = {
  person: "👤",
  constituency: "📍",
  district: "🗺️",
  topic: "#",
  event: "📰",
  narrative: "🧵",
};

/**
 * ⌘K command palette — universal search across people, constituencies,
 * districts, topics, events, narratives. Open with Cmd/Ctrl+K from anywhere.
 * Mounted in every layout via a thin trigger button in the sidebar/topbar.
 */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ⌘K / Ctrl+K to open from anywhere; Esc to close
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Auto-focus when opened
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
    else { setQ(""); setHits([]); setActive(0); }
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (!open) return;
    if (q.trim().length < 2) { setHits([]); return; }
    const ctrl = new AbortController();
    abortRef.current?.abort();
    abortRef.current = ctrl;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`, { signal: ctrl.signal });
        const j = await r.json();
        if (!ctrl.signal.aborted && j.ok) {
          setHits(j.hits);
          setActive(0);
        }
      } catch { /* aborted or network — ignore */ }
      finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 150);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q, open]);

  function go(h: Hit) {
    setOpen(false);
    router.push(h.href);
  }

  function onArrowKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(hits.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Enter" && hits[active]) { e.preventDefault(); go(hits[active]); }
  }

  return (
    <>
      {/* Trigger pill — clickable visual cue in the sidebar */}
      <button
        onClick={() => setOpen(true)}
        title="Search (⌘K)"
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-white px-3 py-2 text-[12px] text-muted hover:border-bronze hover:bg-bronze-soft hover:text-bronze-dark"
      >
        <span className="flex items-center gap-2">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          Search
        </span>
        <kbd className="hidden rounded border border-border bg-surface-2 px-1.5 py-0.5 text-[10px] font-mono text-muted sm:inline">⌘K</kbd>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-navy/30 px-4 pt-[10vh]"
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-white shadow-soft-lg"
          >
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={onArrowKey}
                placeholder="Search people, constituencies, topics, events…"
                className="flex-1 bg-transparent text-sm text-navy outline-none placeholder:text-muted"
              />
              {loading && <span className="text-[10px] text-muted">searching…</span>}
              <kbd className="rounded border border-border bg-surface-2 px-1.5 py-0.5 text-[10px] font-mono text-muted">Esc</kbd>
            </div>

            <div className="max-h-[60vh] overflow-y-auto">
              {q.trim().length < 2 && (
                <div className="px-4 py-6 text-center text-xs text-muted">
                  Type at least 2 characters. Use ↑↓ to navigate, Enter to open.
                </div>
              )}
              {q.trim().length >= 2 && hits.length === 0 && !loading && (
                <div className="px-4 py-6 text-center text-xs text-muted">
                  Nothing found for &quot;{q}&quot;.
                </div>
              )}
              {hits.map((h, i) => (
                <button
                  key={`${h.kind}:${h.href}`}
                  onClick={() => go(h)}
                  onMouseEnter={() => setActive(i)}
                  className={`flex w-full items-center gap-3 px-4 py-2.5 text-left ${
                    i === active ? "bg-bronze-soft" : "hover:bg-surface-2"
                  }`}
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-surface-2 text-base">{KIND_ICON[h.kind]}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block truncate text-sm font-medium text-navy">{h.label}</span>
                    {h.sub && <span className="block truncate text-[11px] text-muted">{h.sub}</span>}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-muted">{KIND_LABEL[h.kind]}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
