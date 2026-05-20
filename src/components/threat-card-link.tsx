"use client";

import { useState } from "react";
import { ThreatDetailSheet } from "./threat-detail-sheet";

// Small inline button that opens the CMO-facing threat detail sheet.

export function ThreatCardLink({ scope_type, scope_id, label = "Read full assessment" }: { scope_type: "cm" | "minister" | "constituency"; scope_id: number | null; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-[11px] text-bronze underline hover:text-bronze-dark">
        {label} →
      </button>
      {open && <ThreatDetailSheet scope_type={scope_type} scope_id={scope_id} onClose={() => setOpen(false)} />}
    </>
  );
}
