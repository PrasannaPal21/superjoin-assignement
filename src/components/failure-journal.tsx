"use client";

import { useEffect, useState } from "react";

type Failure = {
  id: string;
  documentId: string | null;
  stage: string;
  summary: string;
  detail: string | null;
  suggestion: string | null;
  createdAt: string;
};

export function FailureJournal({ refreshKey = 0 }: { refreshKey?: number }) {
  const [failures, setFailures] = useState<Failure[]>([]);

  useEffect(() => {
    void fetch("/api/failures")
      .then((r) => r.json())
      .then((data) => setFailures(data.failures || []));
  }, [refreshKey]);

  return (
    <section className="rounded-2xl border border-line bg-panel p-6 backdrop-blur">
      <h2 className="font-[family-name:var(--font-display)] text-2xl text-ink">
        Failure journal
      </h2>
      <p className="mt-1 text-sm text-muted">
        Honest log of parse gaps, model schema slips, and matching issues.
      </p>
      <ul className="mt-4 space-y-3">
        {failures.length === 0 && (
          <li className="text-sm text-muted">Nothing recorded yet.</li>
        )}
        {failures.map((f) => (
          <li key={f.id} className="rounded-xl border border-line bg-white/70 px-4 py-3">
            <p className="font-mono text-[11px] uppercase text-warn">{f.stage}</p>
            <p className="text-sm font-medium text-ink">{f.summary}</p>
            {f.detail && <p className="mt-1 text-sm text-muted">{f.detail}</p>}
            {f.suggestion && (
              <p className="mt-1 text-sm text-accent">Improve: {f.suggestion}</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
