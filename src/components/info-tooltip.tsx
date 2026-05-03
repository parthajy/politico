"use client";

import { useState } from "react";

export function InfoTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-block">
      <button
        type="button"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="ml-1 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-current text-[9px] font-bold text-muted hover:text-foreground"
        aria-label="More info"
        tabIndex={0}
      >?</button>
      {open && (
        <span className="absolute bottom-full left-1/2 z-30 mb-1.5 w-56 -translate-x-1/2 rounded border border-border bg-white p-2 text-[11px] normal-case tracking-normal text-foreground shadow-sm">
          {text}
        </span>
      )}
    </span>
  );
}
