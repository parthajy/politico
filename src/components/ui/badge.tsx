import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Badges come in two flavours:
//   - solid (s1, navy, bronze) — for primary callouts, eye-catchers
//   - soft (s1-soft, s2-soft, positive-soft, etc.) — pastel chip style
//     used liberally throughout the UI for status pills, sentiment tags etc.
// Default to soft styles for non-emphasis use; solid only when the badge
// IS the focal point of the row.
const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium border whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "border-transparent bg-surface-2 text-foreground/80",
        outline: "border-border bg-white text-muted",
        navy: "border-transparent bg-navy text-white",
        bronze: "border-transparent bg-bronze text-white",
        "bronze-soft": "border-transparent bg-bronze-soft text-bronze-dark",
        // severity solids (kept for back-compat where the badge IS the alarm)
        s1: "border-transparent bg-severity-1 text-white",
        s2: "border-transparent bg-bronze text-white",
        s3: "border-transparent bg-sand-deep text-muted",
        // severity softs — preferred in tables / inline use
        "s1-soft": "border-transparent bg-[var(--severity-1-soft)] text-severity-1",
        "s2-soft": "border-transparent bg-[var(--severity-2-soft)] text-bronze-dark",
        "s3-soft": "border-transparent bg-surface-2 text-muted",
        positive: "border-transparent bg-[var(--positive-soft)] text-positive",
        negative: "border-transparent bg-[var(--negative-soft)] text-negative",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
