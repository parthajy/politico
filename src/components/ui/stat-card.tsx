import * as React from "react";
import { cn } from "@/lib/utils";

type DeltaTone = "positive" | "negative" | "neutral";

export interface StatCardProps {
  label: string;
  value: React.ReactNode;
  hint?: string;
  /** Small delta chip in the top-right (e.g. "+12", "-8%", "vs last 7d"). */
  delta?: { value: string; tone: DeltaTone };
  /** Optional icon-on-the-left (small svg / emoji). */
  icon?: React.ReactNode;
  /** Optional sparkline / extra visual rendered below the value. */
  accessory?: React.ReactNode;
  className?: string;
}

const DELTA_STYLES: Record<DeltaTone, string> = {
  positive: "bg-[var(--positive-soft)] text-positive",
  negative: "bg-[var(--negative-soft)] text-negative",
  neutral: "bg-surface-2 text-muted",
};

/**
 * Big-number stat tile used across all three dashboards. Modeled on the
 * Clients / Revenue / Projects cards in the LoopAI reference: subtle border,
 * label in muted caps, value in a large serif numeric callout, delta chip in
 * the upper-right.
 */
export function StatCard({ label, value, hint, delta, icon, accessory, className }: StatCardProps) {
  return (
    <div className={cn("relative rounded-2xl border border-border bg-white p-4 shadow-soft", className)}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          {icon && (
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-bronze-soft text-bronze-dark">
              {icon}
            </span>
          )}
          <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted">{label}</span>
        </div>
        {delta && (
          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", DELTA_STYLES[delta.tone])}>
            {delta.value}
          </span>
        )}
      </div>
      <div className="numeric-callout mt-2 text-3xl text-navy">{value}</div>
      {hint && <div className="mt-1 text-[11px] text-muted">{hint}</div>}
      {accessory && <div className="mt-3">{accessory}</div>}
    </div>
  );
}
