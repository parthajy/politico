"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

// One-click backfill button. Hits /api/events/reclassify-orphans which
// finds events with no classification row OR with a 'manual_stub' row and
// re-runs the AI classifier on up to 50 of them per call. Used to recover
// from the bug where intern-accepted news got dropped on the floor when
// the inline classifier failed.

export function ReclassifyOrphansButton({ unclassified }: { unclassified: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function run() {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch("/api/events/reclassify-orphans", { method: "POST" });
      const j = await r.json();
      if (!r.ok || !j.ok) { toast.error(j.error ?? "Backfill failed"); return; }
      if (j.classified > 0) {
        toast.success(`${j.classified} event${j.classified === 1 ? "" : "s"} reclassified · ${j.orphans_found} orphans, ${j.stubs_found} stubs found`);
      } else if (j.orphans_found === 0 && j.stubs_found === 0) {
        toast.message("Nothing to recover — every event has a classification.");
      } else {
        toast.error(j.error ?? "Backfill ran but classified 0 — check audit log");
      }
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button size="sm" variant={unclassified > 0 ? "bronze" : "outline"} onClick={run} disabled={busy}>
      {busy ? "Reclassifying…" : unclassified > 0 ? `Recover ${unclassified} orphan${unclassified === 1 ? "" : "s"}` : "Re-classify orphans"}
    </Button>
  );
}
