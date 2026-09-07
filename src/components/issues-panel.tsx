"use client";

import { useEffect, useState } from "react";

type Failure = {
  id: string;
  stage: string;
  summary: string;
  detail: string | null;
  suggestion: string | null;
  createdAt: string;
};

type Cases = {
  corroborates: unknown;
  contradicts: unknown;
  reconciled: unknown;
  failure: Failure | null;
};

/** Failures + one-shot samples of each relation class from live DB. */
export function IssuesPanel({ refreshKey = 0 }: { refreshKey?: number }) {
  const [failures, setFailures] = useState<Failure[]>([]);
  const [cases, setCases] = useState<Cases | null>(null);

  useEffect(() => {
    void Promise.all([
      fetch("/api/failures").then((r) => r.json()),
      fetch("/api/demo-cases").then((r) => r.json()),
    ]).then(([f, c]) => {
      setFailures(f.failures || []);
      setCases(c.cases || null);
    });
  }, [refreshKey]);

  const coverage = [
    { label: "Corroboration sample", ok: Boolean(cases?.corroborates) },
    { label: "Contradiction sample", ok: Boolean(cases?.contradicts) },
    { label: "Reconciled sample", ok: Boolean(cases?.reconciled) },
    { label: "Failure recorded", ok: Boolean(cases?.failure || failures[0]) },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <section>
        <h2 className="text-sm font-medium">Coverage checklist</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Filled automatically from processed documents — open Compare for the actual
          evidence.
        </p>
        <ul className="mt-3 divide-y divide-border rounded-md border border-border bg-card">
          {coverage.map((c) => (
            <li
              key={c.label}
              className="flex items-center justify-between px-3 py-2 text-sm"
            >
              <span>{c.label}</span>
              <span className={c.ok ? "text-ok" : "text-muted-foreground"}>
                {c.ok ? "found" : "pending"}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-sm font-medium">Pipeline issues</h2>
        <ul className="mt-3 divide-y divide-border rounded-md border border-border bg-card">
          {failures.length === 0 && (
            <li className="px-3 py-8 text-center text-sm text-muted-foreground">
              No issues logged.
            </li>
          )}
          {failures.map((f) => (
            <li key={f.id} className="px-3 py-3">
              <div className="flex gap-2 text-[11px] text-muted-foreground">
                <span className="font-mono uppercase text-warn">{f.stage}</span>
                <span>{f.createdAt}</span>
              </div>
              <p className="mt-1 text-sm">{f.summary}</p>
              {f.detail && (
                <p className="mt-1 text-xs text-muted-foreground">{f.detail}</p>
              )}
              {f.suggestion && (
                <p className="mt-1 text-xs text-foreground/80">{f.suggestion}</p>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
