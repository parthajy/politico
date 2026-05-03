"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function GenerateAllButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function generate() {
    if (busy) return;
    setBusy(true);
    const t = toast.loading("AI assessing CM + top 5 ministers + top 5 constituencies… (may take 30–60s)");
    try {
      const r = await fetch("/api/threats/generate-all", { method: "POST" });
      const j = await r.json();
      toast.dismiss(t);
      if (!r.ok || !j.ok) {
        toast.error(j.error ?? "Threat generation failed");
        return;
      }
      const ok = (j.results ?? []).filter((r: { ok: boolean }) => r.ok).length;
      const total = (j.results ?? []).length;
      toast.success(`${ok}/${total} entities assessed · ${(j.ms / 1000).toFixed(1)}s`);
      router.refresh();
    } catch (e) {
      toast.dismiss(t);
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button onClick={generate} disabled={busy} variant="bronze">
      {busy ? "Generating…" : "Generate all threats"}
    </Button>
  );
}
