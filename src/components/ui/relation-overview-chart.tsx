"use client";

import { motion } from "motion/react";

type Counts = {
  corroborates: number;
  contradicts: number;
  reconciled: number;
};

/** Compact overview bars (Bklit-inspired). */
export function RelationOverviewChart({ counts }: { counts: Counts }) {
  const rows = [
    { key: "corroborates", label: "Corroborates", value: counts.corroborates, color: "var(--ok)" },
    { key: "contradicts", label: "Contradicts", value: counts.contradicts, color: "var(--danger)" },
    { key: "reconciled", label: "Reconciled", value: counts.reconciled, color: "var(--primary)" },
  ];
  const max = Math.max(1, ...rows.map((r) => r.value));

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Relation mix
      </p>
      {rows.map((r) => (
        <div key={r.key} className="grid grid-cols-[110px_1fr_40px] items-center gap-2">
          <span className="text-xs">{r.label}</span>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <motion.div
              className="h-full rounded-full"
              style={{ background: r.color }}
              initial={{ width: 0 }}
              animate={{ width: `${(r.value / max) * 100}%` }}
              transition={{ duration: 0.45, ease: "easeOut" }}
            />
          </div>
          <span className="font-mono text-xs text-muted-foreground">{r.value}</span>
        </div>
      ))}
    </div>
  );
}
