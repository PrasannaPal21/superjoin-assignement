"use client";

import { useEffect, useState } from "react";

type Side = {
  claim: string;
  documentName: string | null;
  evidence: { page: number | null; quote: string } | null;
  rawValue: string | null;
  unit: string | null;
  period: string | null;
  scope: string | null;
} | null;

type CaseRel = {
  relationType: string;
  rationale: string | null;
  contextTags: string[];
  confidence: number;
  a: Side;
  b: Side;
} | null;

type Cases = {
  corroborates: CaseRel;
  contradicts: CaseRel;
  reconciled: CaseRel;
  failure: {
    stage: string;
    summary: string;
    detail: string | null;
    suggestion: string | null;
  } | null;
};

export function DemoCasesPanel({ refreshKey = 0 }: { refreshKey?: number }) {
  const [cases, setCases] = useState<Cases | null>(null);

  useEffect(() => {
    void fetch("/api/demo-cases")
      .then((r) => r.json())
      .then((data) => setCases(data.cases));
  }, [refreshKey]);

  return (
    <section className="rounded-2xl border border-line bg-panel p-6 backdrop-blur">
      <h2 className="font-[family-name:var(--font-display)] text-2xl text-ink">
        Required demo cases
      </h2>
      <p className="mt-1 text-sm text-muted">
        Pulled live from the knowledge layer after you process multiple PDFs — not
        hard-coded answers.
      </p>

      <div className="mt-5 space-y-4">
        <CaseBlock
          title="1. Corroboration"
          hint="Same underlying fact, different wording."
          rel={cases?.corroborates ?? null}
        />
        <CaseBlock
          title="2. Contradiction"
          hint="Genuine or likely conflict."
          rel={cases?.contradicts ?? null}
        />
        <CaseBlock
          title="3. Reconciled by context"
          hint="Apparent conflict explained by time, scope, or units."
          rel={cases?.reconciled ?? null}
        />
        <div className="rounded-xl border border-line bg-white/70 p-4">
          <h3 className="text-sm font-semibold text-ink">4. Extraction / reasoning failure</h3>
          <p className="mt-1 text-xs text-muted">
            What broke, and how we handled or would improve it.
          </p>
          {cases?.failure ? (
            <div className="mt-3 space-y-1 text-sm">
              <p className="font-mono text-xs uppercase text-warn">{cases.failure.stage}</p>
              <p className="font-medium text-ink">{cases.failure.summary}</p>
              {cases.failure.detail && (
                <p className="text-muted">{cases.failure.detail}</p>
              )}
              {cases.failure.suggestion && (
                <p className="text-accent">Next: {cases.failure.suggestion}</p>
              )}
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted">
              No failure journal entries yet. Empty-text pages and model parse errors are
              recorded automatically.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function CaseBlock({
  title,
  hint,
  rel,
}: {
  title: string;
  hint: string;
  rel: CaseRel;
}) {
  return (
    <div className="rounded-xl border border-line bg-white/70 p-4">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <p className="text-xs text-muted">{hint}</p>
      {!rel && (
        <p className="mt-3 text-sm text-muted">
          Waiting for a matching relation in the database…
        </p>
      )}
      {rel && (
        <div className="mt-3 space-y-2">
          <p className="text-sm text-ink">{rel.rationale}</p>
          <div className="flex flex-wrap gap-2">
            {rel.contextTags.map((t) => (
              <span
                key={t}
                className="rounded bg-ink/5 px-2 py-0.5 font-mono text-[11px] text-muted"
              >
                {t}
              </span>
            ))}
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <MiniSide label="A" side={rel.a} />
            <MiniSide label="B" side={rel.b} />
          </div>
        </div>
      )}
    </div>
  );
}

function MiniSide({ label, side }: { label: string; side: Side }) {
  if (!side) return null;
  return (
    <div className="rounded-lg border border-line p-3 text-sm">
      <p className="font-mono text-[11px] text-muted">
        {label} · {side.documentName}
      </p>
      <p className="mt-1 font-medium text-ink">{side.claim}</p>
      {side.evidence && (
        <p className="mt-2 text-xs text-muted">
          p.{side.evidence.page ?? "?"} “{side.evidence.quote}”
        </p>
      )}
    </div>
  );
}
