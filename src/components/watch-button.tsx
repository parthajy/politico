"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export type WatchKind = "minister" | "constituency" | "district" | "topic" | "narrative";

export interface WatchButtonProps {
  kind: WatchKind;
  refId: string;
  label: string;
  /** If true, render a full pill button with text. If false, just a star icon. */
  showLabel?: boolean;
  /** Initial watched state — if known by the server, skips the fetch. */
  initialWatched?: boolean;
  className?: string;
}

/**
 * Pin / unpin button for adding entities to the user's watchlist.
 * Used on minister/constituency/district/topic/narrative pages.
 *
 * Optimistic — flips the UI immediately, reverts on error.
 */
export function WatchButton({ kind, refId, label, showLabel = true, initialWatched, className = "" }: WatchButtonProps) {
  const router = useRouter();
  const [watched, setWatched] = useState<boolean | null>(initialWatched ?? null);
  const [busy, setBusy] = useState(false);

  // If parent didn't tell us, fetch current state once.
  useEffect(() => {
    if (initialWatched != null) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/watch");
        const j = await r.json();
        if (cancelled || !j.ok) return;
        const found = (j.items as { kind: string; ref_id: string }[]).some((i) => i.kind === kind && i.ref_id === refId);
        setWatched(found);
      } catch { /* swallow — button just shows neutral state */ }
    })();
    return () => { cancelled = true; };
  }, [kind, refId, initialWatched]);

  async function toggle() {
    if (busy) return;
    setBusy(true);
    const prev = watched;
    setWatched(!prev);
    try {
      if (prev) {
        const r = await fetch(`/api/watch?kind=${kind}&ref_id=${encodeURIComponent(refId)}`, { method: "DELETE" });
        const j = await r.json();
        if (!r.ok || !j.ok) throw new Error(j.error ?? "Unpin failed");
        toast.success(`Removed ${label} from your watchlist`);
      } else {
        const r = await fetch("/api/watch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind, ref_id: refId, label }),
        });
        const j = await r.json();
        if (!r.ok || !j.ok) throw new Error(j.error ?? "Pin failed");
        toast.success(`Pinned ${label} — you'll see it in your watchlist + daily digest`);
      }
      router.refresh();
    } catch (e) {
      setWatched(prev); // revert
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const isOn = watched === true;
  const tooltip = isOn ? `Unpin ${label} from your watchlist` : `Pin ${label} to your watchlist`;

  return (
    <button
      onClick={toggle}
      disabled={busy || watched === null}
      title={tooltip}
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition ${
        isOn
          ? "border-bronze bg-bronze-soft text-bronze-dark"
          : "border-border bg-white text-muted hover:border-bronze hover:text-bronze-dark"
      } disabled:opacity-50 ${className}`}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill={isOn ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {/* pin icon */}
        <path d="M12 17v5" />
        <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
      </svg>
      {showLabel && <span>{isOn ? "Watching" : "Watch"}</span>}
    </button>
  );
}
