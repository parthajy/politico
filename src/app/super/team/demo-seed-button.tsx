"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

// Single-button widget. Calls /api/demo/seed-accounts which idempotently
// creates+resets passwords on the six demo accounts shown on /login.
// Useful when you add the intern / minister demo buttons and need the
// underlying users to actually exist with the demo password set.
export function DemoSeedButton() {
  const [busy, setBusy] = useState(false);

  async function refresh() {
    if (!confirm("Reset passwords on all 6 demo accounts to DEMO_USER_PASSWORD? Existing users will be updated; missing ones created.")) return;
    setBusy(true);
    try {
      const r = await fetch("/api/demo/seed-accounts", { method: "POST" });
      const j = await r.json();
      if (!r.ok || !j.ok) { toast.error(j.error ?? "Seed failed"); return; }
      const created = j.results.filter((x: { status: string }) => x.status === "created").length;
      const updated = j.results.filter((x: { status: string }) => x.status === "updated").length;
      const errors = j.results.filter((x: { status: string }) => x.status === "error");
      toast.success(`Demo seed: ${created} created, ${updated} updated${errors.length > 0 ? `, ${errors.length} errors` : ""}`);
      if (errors.length > 0) {
        console.warn("Demo seed errors:", errors);
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={refresh} disabled={busy}>
      {busy ? "Refreshing…" : "Refresh demo accounts"}
    </Button>
  );
}
