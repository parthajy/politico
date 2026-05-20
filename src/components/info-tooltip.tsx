"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";

// Tooltip that renders into a fixed-position portal so it is never clipped
// by parent overflow/stacking contexts (cards, tables, etc.).

export function InfoTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  function show() {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ top: r.top, left: r.left + r.width / 2 });
    setOpen(true);
  }
  function hide() { setOpen(false); }

  return (
    <span className="relative inline-block align-middle">
      <button
        ref={btnRef}
        type="button"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={(e) => { e.stopPropagation(); if (open) hide(); else show(); }}
        className="ml-1 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-current text-[9px] font-bold leading-none text-muted hover:text-foreground"
        aria-label="More info"
      >?</button>
      {open && pos && typeof document !== "undefined" && createPortal(
        <span
          className="pointer-events-none fixed z-[100] w-60 -translate-x-1/2 -translate-y-full rounded border border-border bg-white p-2 text-[11px] font-normal normal-case leading-snug tracking-normal text-foreground shadow-md"
          style={{ top: pos.top - 6, left: pos.left }}
        >
          {text}
        </span>,
        document.body,
      )}
    </span>
  );
}
