"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/format";
import { Check, CircleDashed, FlaskConical, NotebookText, Wrench } from "lucide-react";

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
    ])
      .then(([f, c]) => {
        setFailures(f.failures || []);
        setCases(c.cases || null);
      })
      .catch(() => undefined);
  }, [refreshKey]);

  const checks = [
    { label: "Agrees comparison", desc: "Two documents confirming the same fact", ok: Boolean(cases?.corroborates) },
    { label: "Conflicts comparison", desc: "Two documents disagreeing on a value", ok: Boolean(cases?.contradicts) },
    { label: "Different-context comparison", desc: "Apparent conflict resolved by time, scope, or units", ok: Boolean(cases?.reconciled) },
    { label: "Pipeline failure logged", desc: "The system records what broke and why", ok: Boolean(cases?.failure) || failures.length > 0 },
  ];
  const passed = checks.filter((c) => c.ok).length;

  return (
    <div className="mx-auto grid max-w-4xl gap-4 pt-1 lg:grid-cols-2">
      {/* Demo readiness */}
      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-2.5">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <FlaskConical className="size-4 text-accent-foreground" />
            Demo readiness
          </h2>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[11px] font-semibold tabular",
              passed === checks.length ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn",
            )}
          >
            {passed}/{checks.length} ready
          </span>
        </div>
        <ul className="divide-y divide-border/70">
          {checks.map((c) => (
            <li key={c.label} className="flex items-start gap-3 px-4 py-3">
              <span
                className={cn(
                  "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full",
                  c.ok ? "bg-ok text-white" : "border border-border bg-muted",
                )}
              >
                {c.ok ? <Check className="size-3" strokeWidth={3} /> : <CircleDashed className="size-3 text-muted-foreground" />}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-foreground">{c.label}</span>
                <span className="block text-xs text-muted-foreground">{c.desc}</span>
              </span>
              {!c.ok && (
                <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                  pending
                </span>
              )}
            </li>
          ))}
        </ul>
        <p className="border-t border-border bg-muted/20 px-4 py-2 text-[11px] text-muted-foreground">
          These appear as you process documents — check the Compare tab for the evidence pairs.
        </p>
      </section>

      {/* Failure journal */}
      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-2.5">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <NotebookText className="size-4 text-accent-foreground" />
            Failure journal
          </h2>
          <span className="text-[11px] tabular text-muted-foreground">
            {failures.length} entr{failures.length === 1 ? "y" : "ies"}
          </span>
        </div>

        <ul className="max-h-[440px] divide-y divide-border/70 overflow-auto">
          {failures.length === 0 && (
            <li className="px-4 py-12 text-center">
              <Check className="mx-auto mb-2 size-6 text-ok/60" />
              <p className="text-sm font-medium text-foreground">No failures recorded</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Processing issues will be logged here with suggested fixes.
              </p>
            </li>
          )}
          {failures.map((f) => (
            <li key={f.id} className="px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="rounded bg-warn-soft px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-warn">
                  {f.stage}
                </span>
                <span className="text-[11px] text-muted-foreground">{timeAgo(f.createdAt)}</span>
              </div>
              <p className="mt-1.5 text-sm font-medium leading-snug text-foreground">{f.summary}</p>
              {f.detail && (
                <p className="mt-1 break-words text-xs leading-relaxed text-muted-foreground">
                  {f.detail}
                </p>
              )}
              {f.suggestion && (
                <p className="mt-1.5 flex items-start gap-1.5 text-xs text-accent-foreground">
                  <Wrench className="mt-0.5 size-3 shrink-0" />
                  {f.suggestion}
                </p>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
