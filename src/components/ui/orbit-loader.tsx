"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/utils";

/** Kokonut-inspired compact loader — dots orbiting a ring. */
export function OrbitLoader({
  label = "Working",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex items-center gap-3 text-sm text-muted", className)}>
      <div className="relative h-8 w-8">
        <div className="absolute inset-0 rounded-full border border-line" />
        <motion.span
          className="absolute left-1/2 top-0 h-2 w-2 -translate-x-1/2 rounded-full bg-accent"
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1.1, ease: "linear" }}
          style={{ transformOrigin: "50% 16px" }}
        />
        <motion.span
          className="absolute left-1/2 top-0 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-ink/40"
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1.1, ease: "linear", delay: 0.2 }}
          style={{ transformOrigin: "50% 16px" }}
        />
      </div>
      <span>{label}</span>
    </div>
  );
}
