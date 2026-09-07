"use client";

import { motion } from "motion/react";

type Counts = {
  corroborates: number;
  contradicts: number;
  reconciled: number;
};

/** Bklit-inspired minimal bar overview — no heavy chart lib. */
export function RelationOverviewChart({ counts }: { counts: Counts }) {
  const rows = [
    { key: "corroborates", label: "Corroborates", value: counts.corroborates, color: "#1f6b3a" },
    { key: "contradicts", label: "Contradicts", value: counts.contradicts, color: "#8f2f2f" },
    { key: "reconciled", label: "Reconciled", value: counts.reconciled, color: "#0f6b5c" },
  ];
  const max = Math.max(1, ...rows.map((r) => r.value));

  return (
    <div className="space-y-3 rounded-xl border border-line bg-white/60 p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">
        Relation mix
      </p>
      {rows.map((r) => (
        <div key={r.key} className="grid grid-cols-[110px_1fr_40px] items-center gap-2">
          <span className="text-xs text-ink">{r.label}</span>
          <div className="h-2 overflow-hidden rounded-full bg-line/60">
            <motion.div
              className="h-full rounded-full"
              style={{ background: r.color }}
              initial={{ width: 0 }}
              animate={{ width: `${(r.value / max) * 100}%` }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            />
          </div>
          <span className="font-mono text-xs text-muted">{r.value}</span>
        </div>
      ))}
    </div>
  );
}
