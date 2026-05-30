"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

type Status = "new" | "triaged" | "in_progress" | "done" | "wontfix";

const STEPS: { v: Status; l: string }[] = [
  { v: "new", l: "New" },
  { v: "triaged", l: "Triaged" },
  { v: "in_progress", l: "In progress" },
  { v: "done", l: "Done" },
  { v: "wontfix", l: "Won't fix" },
];

export function StatusButtons({ id, current }: { id: number; current: Status }) {
  const router = useRouter();
  const [busy, setBusy] = useState<Status | null>(null);

  async function set(s: Status) {
    if (busy || s === current) return;
    setBusy(s);
    try {
      const r = await fetch(`/api/feedback/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: s }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) { toast.error(j.error ?? "Update failed"); return; }
      toast.success(`Marked ${s.replace("_", " ")}`);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap gap-1">
      {STEPS.map((s) => {
        const active = s.v === current;
        return (
          <button
            key={s.v}
            onClick={() => set(s.v)}
            disabled={!!busy}
            className={`rounded-md border px-2.5 py-1 text-[11px] font-medium transition ${
              active
                ? "border-bronze bg-bronze-soft text-bronze-dark"
                : "border-border bg-white text-muted hover:border-bronze hover:text-bronze-dark"
            } disabled:opacity-50`}
          >
            {busy === s.v ? "…" : s.l}
          </button>
        );
      })}
    </div>
  );
}
