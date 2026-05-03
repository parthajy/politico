import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium border",
  {
    variants: {
      variant: {
        default: "border-border bg-sand text-foreground",
        navy: "border-navy bg-navy text-white",
        bronze: "border-bronze bg-bronze text-white",
        outline: "border-border bg-white text-muted",
        s1: "border-severity-1 bg-severity-1 text-white",
        s2: "border-bronze bg-bronze text-white",
        s3: "border-border bg-sand text-muted",
        positive: "border-positive bg-white text-positive",
        negative: "border-negative bg-white text-negative",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
