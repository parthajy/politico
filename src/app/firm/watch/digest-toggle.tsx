"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

/**
 * Toggle subscribe / unsubscribe to the daily digest email. Lives on the
 * watchlist page since the digest is the surface where watched items get
 * surfaced — both controls in one place.
 */
export function DigestToggle({ enabled: initialEnabled, email }: { enabled: boolean; email: string }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (busy) return;
    setBusy(true);
    const prev = enabled;
    setEnabled(!prev);
    try {
      const r = await fetch("/api/digest/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !prev }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Toggle failed");
      toast.success(!prev ? `Subscribed — daily digest goes to ${email} at 5:30 IST` : "Unsubscribed from daily digest");
      router.refresh();
    } catch (e) {
      setEnabled(prev);
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
        enabled ? "border-positive bg-[var(--positive-soft)] text-positive" : "border-border bg-white text-muted hover:bg-surface-2"
      } disabled:opacity-50`}
    >
      <span className={`inline-block h-2 w-2 rounded-full ${enabled ? "bg-positive" : "bg-muted/40"}`} />
      Daily digest · {enabled ? "On" : "Off"}
    </button>
  );
}
