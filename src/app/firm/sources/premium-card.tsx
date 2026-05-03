"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function PremiumCard({ name, desc, unlocks }: { name: string; desc: string; unlocks: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="flex flex-col rounded-lg border border-border bg-sand-deep p-5 opacity-90">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-serif text-lg font-bold text-navy">{name}</h3>
          <Badge variant="outline">Available — not connected</Badge>
        </div>
        <p className="mt-2 flex-1 text-xs text-muted">{desc}</p>
        <Button onClick={() => setOpen(true)} variant="outline" size="sm" className="mt-4 self-start">
          Connect
        </Button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-deep/40 p-6" onClick={() => setOpen(false)}>
          <div
            className="w-full max-w-lg rounded-lg border border-border bg-white p-6 shadow-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-xs uppercase tracking-[0.18em] text-bronze">Premium source</div>
            <h2 className="mt-2 font-serif text-2xl font-bold text-navy">{name}</h2>
            <p className="mt-2 text-sm text-muted">{desc}</p>
            <div className="mt-5">
              <div className="text-xs uppercase tracking-wider text-muted">Unlocks</div>
              <p className="mt-1 text-sm">{unlocks}</p>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
              <Button variant="bronze" disabled title="Available post-contract">Request access</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
