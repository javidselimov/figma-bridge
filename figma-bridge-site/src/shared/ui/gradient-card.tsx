import { cn } from "@/shared/lib/cn";

import type { ReactNode } from "react";

export type GradientCardProps = { className?: string; children: ReactNode };

/** Faint green card with a slowly drifting gradient surface (static under prefers-reduced-motion). */
export function GradientCard({ className, children }: GradientCardProps) {
  return (
    <div className={cn("gradient-shift rounded-xl border border-primary/25", className)}>
      {children}
    </div>
  );
}
