"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function RefreshButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setBusy(true);
    const t = toast.loading("Fetching from all live sources…");
    try {
      const r = await fetch("/api/ingest/run", { method: "POST" });
      const j = await r.json();
      toast.dismiss(t);
      if (!r.ok || !j.ok) {
        toast.error(`Refresh failed: ${j.error ?? r.status}`);
        return;
      }
      const totalInserted = (j.summaries ?? []).reduce(
        (acc: number, s: { inserted: number }) => acc + (s.inserted ?? 0),
        0,
      );
      const totalClassified = (j.summaries ?? []).reduce(
        (acc: number, s: { classified: number }) => acc + (s.classified ?? 0),
        0,
      );
      toast.success(
        `+${totalInserted} new event${totalInserted === 1 ? "" : "s"}, ${totalClassified} classified · ${(j.ms / 1000).toFixed(1)}s`
      );
      router.refresh();
    } catch (e) {
      toast.dismiss(t);
      toast.error(`Refresh failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button onClick={refresh} disabled={busy} variant="bronze">
      {busy ? "Refreshing…" : "Refresh now"}
    </Button>
  );
}
