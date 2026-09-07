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
  failure: unknown;
};

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

  const checks = [
    { label: "Has an “Agrees” comparison", ok: Boolean(cases?.corroborates) },
    { label: "Has a “Conflicts” comparison", ok: Boolean(cases?.contradicts) },
    {
      label: "Has a “Different context” comparison",
      ok: Boolean(cases?.reconciled),
    },
    {
      label: "Has at least one pipeline issue logged",
      ok: Boolean(cases?.failure) || failures.length > 0,
    },
  ];

  return (
    <div className="mx-auto grid max-w-4xl gap-4 lg:grid-cols-2">
      <section className="rounded-md border border-border bg-card">
        <div className="border-b border-border px-3 py-2 text-sm font-medium">
          What you can demonstrate
        </div>
        <ul className="divide-y divide-border">
          {checks.map((c) => (
            <li
              key={c.label}
              className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"
            >
              <span>{c.label}</span>
              <span className={c.ok ? "text-ok" : "text-muted-foreground"}>
                {c.ok ? "yes" : "not yet"}
              </span>
            </li>
          ))}
        </ul>
        <p className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
          Open Compare to inspect the matching evidence pairs.
        </p>
      </section>

      <section className="rounded-md border border-border bg-card">
        <div className="border-b border-border px-3 py-2 text-sm font-medium">
          Pipeline log
        </div>
        <ul className="max-h-[480px] divide-y divide-border overflow-auto">
          {failures.length === 0 && (
            <li className="px-3 py-8 text-center text-sm text-muted-foreground">
              No failures recorded.
            </li>
          )}
          {failures.map((f) => (
            <li key={f.id} className="px-3 py-3">
              <div className="flex gap-2 text-[11px]">
                <span className="font-mono uppercase text-warn">{f.stage}</span>
                <span className="text-muted-foreground">{f.createdAt}</span>
              </div>
              <p className="mt-1 text-sm">{f.summary}</p>
              {f.detail && (
                <p className="mt-1 break-words text-xs text-muted-foreground">
                  {f.detail}
                </p>
              )}
              {f.suggestion && (
                <p className="mt-1 text-xs text-primary">{f.suggestion}</p>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
