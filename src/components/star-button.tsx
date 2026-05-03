"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export function StarButton({
  eventId,
  initialStarred,
  size = "md",
  showLabel = false,
}: {
  eventId: string;
  initialStarred: boolean;
  size?: "sm" | "md";
  showLabel?: boolean;
}) {
  const router = useRouter();
  const [starred, setStarred] = useState(initialStarred);
  const [busy, setBusy] = useState(false);

  async function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const next = !starred;
    setStarred(next); // optimistic
    try {
      const r = await fetch(`/api/events/${eventId}/star`, { method: next ? "POST" : "DELETE" });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        setStarred(!next);
        toast.error(j.error ?? "Star failed");
      } else {
        if (next) toast.success("Saved to your reading list");
        router.refresh();
      }
    } catch (err) {
      setStarred(!next);
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const dim = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";
  const label = starred ? "Saved" : "Save";

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={starred}
      aria-label={starred ? "Remove from reading list" : "Save to reading list"}
      className="inline-flex items-center gap-1 rounded text-xs text-muted hover:text-bronze disabled:opacity-50"
    >
      <svg className={dim} viewBox="0 0 20 20" fill={starred ? "var(--bronze)" : "none"} stroke={starred ? "var(--bronze)" : "currentColor"} strokeWidth={1.5}>
        <path d="M9.05 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.957a1 1 0 00.95.69h4.16c.969 0 1.371 1.24.588 1.81l-3.366 2.446a1 1 0 00-.364 1.118l1.287 3.957c.3.92-.755 1.688-1.539 1.118L10.588 15.347a1 1 0 00-1.176 0l-3.366 2.446c-.784.57-1.838-.198-1.539-1.118l1.287-3.957a1 1 0 00-.364-1.118L2.064 9.384c-.783-.57-.38-1.81.588-1.81h4.16a1 1 0 00.95-.69l1.286-3.957z" />
      </svg>
      {showLabel && <span>{label}</span>}
    </button>
  );
}
