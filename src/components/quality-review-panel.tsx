"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";

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

/** Production quality-review surface (assignment cases without demo framing). */
export function QualityReviewPanel({ refreshKey = 0 }: { refreshKey?: number }) {
  const [cases, setCases] = useState<Cases | null>(null);

  useEffect(() => {
    void fetch("/api/demo-cases")
      .then((r) => r.json())
      .then((data) => setCases(data.cases));
  }, [refreshKey]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Live samples from the current knowledge layer: corroboration, conflict,
        context-reconciled differences, and pipeline failures.
      </p>

      <CaseBlock
        title="Corroboration"
        hint="Same underlying claim across documents."
        rel={cases?.corroborates ?? null}
      />
      <CaseBlock
        title="Contradiction"
        hint="Genuine or likely conflict."
        rel={cases?.contradicts ?? null}
      />
      <CaseBlock
        title="Reconciled by context"
        hint="Apparent conflict explained by time, scope, or units."
        rel={cases?.reconciled ?? null}
      />

      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <h3 className="text-sm font-semibold">Extraction / reasoning failure</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Recorded automatically when parse, extract, or match stages degrade.
        </p>
        {cases?.failure ? (
          <div className="mt-3 space-y-1 text-sm">
            <Badge variant="outline" className="border-warn/30 bg-warn/10 text-warn">
              {cases.failure.stage}
            </Badge>
            <p className="font-medium">{cases.failure.summary}</p>
            {cases.failure.detail && (
              <p className="text-muted-foreground">{cases.failure.detail}</p>
            )}
            {cases.failure.suggestion && (
              <p className="text-primary">Action: {cases.failure.suggestion}</p>
            )}
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">No failures recorded yet.</p>
        )}
      </div>
    </div>
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
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="text-xs text-muted-foreground">{hint}</p>
      {!rel && (
        <p className="mt-3 text-sm text-muted-foreground">
          No matching relation in the database yet.
        </p>
      )}
      {rel && (
        <div className="mt-3 space-y-2">
          <p className="text-sm">{rel.rationale}</p>
          <div className="flex flex-wrap gap-2">
            {rel.contextTags.map((t) => (
              <Badge key={t} variant="secondary" className="font-mono text-[10px]">
                {t}
              </Badge>
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
    <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
      <p className="font-mono text-[11px] text-muted-foreground">
        {label} · {side.documentName}
      </p>
      <p className="mt-1 font-medium">{side.claim}</p>
      {side.evidence && (
        <p className="mt-2 text-xs text-muted-foreground">
          p.{side.evidence.page ?? "?"} “{side.evidence.quote}”
        </p>
      )}
    </div>
  );
}
