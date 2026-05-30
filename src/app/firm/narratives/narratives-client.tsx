"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function NarrativesClient() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function run(mode: "urgent_24h" | "forming_7d" | "review_30d") {
    if (busy) return;
    setBusy(mode);
    const start = Date.now();
    try {
      const r = await fetch("/api/narratives", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) { toast.error(j.error ?? "Detection failed"); return; }
      const dur = ((Date.now() - start) / 1000).toFixed(0);
      toast.success(`Done in ${dur}s · ${j.created ?? 0} new, ${j.updated ?? 0} evolved`);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex gap-2">
      <Button size="sm" variant="outline" onClick={() => run("urgent_24h")} disabled={!!busy} title="Scan the last 24 hours for urgent clusters">
        {busy === "urgent_24h" ? "Scanning…" : "🔴 Scan 24h"}
      </Button>
      <Button size="sm" variant="bronze" onClick={() => run("forming_7d")} disabled={!!busy} title="Run the standard 7-day detection (default)">
        {busy === "forming_7d" ? "Detecting…" : "Regenerate (7d)"}
      </Button>
      <Button size="sm" variant="outline" onClick={() => run("review_30d")} disabled={!!busy} title="Full 30-day review — catches established and decaying narratives">
        {busy === "review_30d" ? "Reviewing…" : "30d review"}
      </Button>
    </div>
  );
}
