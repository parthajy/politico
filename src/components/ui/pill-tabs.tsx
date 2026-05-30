"use client";

import { cn } from "@/lib/utils";

export interface PillTab<T extends string = string> {
  value: T;
  label: string;
  count?: number;
}

export interface PillTabsProps<T extends string = string> {
  value: T;
  options: PillTab<T>[];
  onChange: (v: T) => void;
  className?: string;
  size?: "sm" | "md";
}

/**
 * Horizontal pill-style tab nav. Modeled on the Overview / Clients / Projects
 * tab row in the LoopAI reference. Active pill gets bronze background + dark
 * bronze text; inactive pills are muted and gain a subtle surface bg on hover.
 */
export function PillTabs<T extends string>({ value, options, onChange, className, size = "md" }: PillTabsProps<T>) {
  const padding = size === "sm" ? "px-3 py-1.5 text-[12px]" : "px-4 py-2 text-sm";
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-border bg-white p-1 shadow-soft",
        className,
      )}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex items-center gap-1.5 rounded-full font-medium transition",
              padding,
              active
                ? "bg-bronze-soft text-bronze-dark"
                : "text-muted hover:bg-surface-2 hover:text-foreground",
            )}
          >
            {o.label}
            {typeof o.count === "number" && (
              <span
                className={cn(
                  "rounded-full px-1.5 text-[10px]",
                  active ? "bg-bronze text-white" : "bg-surface-2 text-muted",
                )}
              >
                {o.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
