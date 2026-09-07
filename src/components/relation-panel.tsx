"use client";

import { useEffect, useState } from "react";

type Relation = {
  id: string;
  relationType: string;
  rationale: string | null;
  contextTags: string[];
  confidence: number;
  a: {
    claim: string;
    documentName: string | null;
    evidence: { page: number | null; quote: string } | null;
    period: string | null;
    scope: string | null;
    unit: string | null;
    rawValue: string | null;
  };
  b: {
    claim: string;
    documentName: string | null;
    evidence: { page: number | null; quote: string } | null;
    period: string | null;
    scope: string | null;
    unit: string | null;
    rawValue: string | null;
  };
};

export function RelationPanel({ refreshKey = 0 }: { refreshKey?: number }) {
  const [relations, setRelations] = useState<Relation[]>([]);
  const [counts, setCounts] = useState({
    corroborates: 0,
    contradicts: 0,
    reconciled: 0,
  });
  const [filter, setFilter] = useState("");

  useEffect(() => {
    const params = filter ? `?type=${filter}` : "";
    void fetch(`/api/relations${params}`)
      .then((r) => r.json())
      .then((data) => {
        setRelations(data.relations || []);
        if (!filter && data.counts) setCounts(data.counts);
      });
  }, [filter, refreshKey]);

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Same claim across docs, conflicts, or differences explained by time / scope /
          units.
        </p>
        <div className="flex items-center gap-3 text-xs font-mono text-muted-foreground">
          <span>same {counts.corroborates}</span>
          <span>conflict {counts.contradicts}</span>
          <span>context {counts.reconciled}</span>
        </div>
      </div>

      <select
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="h-8 rounded-md border border-input bg-card px-2 text-sm"
      >
        <option value="">All</option>
        <option value="corroborates">Corroborates</option>
        <option value="contradicts">Contradicts</option>
        <option value="reconciled">Reconciled</option>
      </select>

      {relations.length === 0 && (
        <p className="py-12 text-center text-sm text-muted-foreground">
          Process at least two PDFs to see comparisons.
        </p>
      )}

      <ul className="space-y-3">
        {relations.map((r) => (
          <li key={r.id} className="rounded-md border border-border bg-card p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
              <span className="font-mono uppercase">{r.relationType}</span>
              <span className="text-muted-foreground">
                {(r.confidence * 100).toFixed(0)}%
              </span>
              {r.contextTags.map((t) => (
                <span key={t} className="rounded bg-muted px-1.5 py-0.5 font-mono">
                  {t}
                </span>
              ))}
            </div>
            <p className="mb-3 text-sm">{r.rationale}</p>
            <div className="grid gap-2 md:grid-cols-2">
              <Side label="A" fact={r.a} />
              <Side label="B" fact={r.b} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Side({
  label,
  fact,
}: {
  label: string;
  fact: Relation["a"];
}) {
  return (
    <div className="rounded border border-border bg-muted/40 p-2.5 text-sm">
      <p className="text-[11px] uppercase text-muted-foreground">
        {label} · {fact.documentName || "doc"}
      </p>
      <p className="mt-1 font-medium">{fact.claim}</p>
      <p className="mt-1 font-mono text-[11px] text-muted-foreground">
        {[fact.rawValue, fact.unit, fact.period, fact.scope].filter(Boolean).join(" · ")}
      </p>
      {fact.evidence && (
        <p className="mt-2 text-xs text-muted-foreground">
          p.{fact.evidence.page ?? "?"} {fact.evidence.quote}
        </p>
      )}
    </div>
  );
}
