"use client";

import { useEffect, useState } from "react";
import { RelationOverviewChart } from "@/components/ui/relation-overview-chart";

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
    <section className="rounded-2xl border border-line bg-panel p-6 backdrop-blur">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-2xl text-ink">
            Cross-document relations
          </h2>
          <p className="text-sm text-muted">
            Side-by-side evidence with an explicit reason for the link.
          </p>
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="rounded-lg border border-line bg-white/80 px-3 py-2 text-sm"
        >
          <option value="">All relations</option>
          <option value="corroborates">Corroborates</option>
          <option value="contradicts">Contradicts</option>
          <option value="reconciled">Reconciled</option>
        </select>
      </div>

      <RelationOverviewChart counts={counts} />

      <div className="mt-5 space-y-4">
        {relations.length === 0 && (
          <p className="text-sm text-muted">
            Relations appear after at least two documents have been processed.
          </p>
        )}
        {relations.map((r) => (
          <article key={r.id} className="rounded-xl border border-line bg-white/70 p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <TypeBadge type={r.relationType} />
              <span className="font-mono text-[11px] text-muted">
                conf {(r.confidence * 100).toFixed(0)}%
              </span>
              {r.contextTags.map((t) => (
                <span
                  key={t}
                  className="rounded bg-ink/5 px-2 py-0.5 font-mono text-[11px] text-muted"
                >
                  {t}
                </span>
              ))}
            </div>
            <p className="mb-3 text-sm text-ink">{r.rationale}</p>
            <div className="grid gap-3 md:grid-cols-2">
              <EvidenceSide side="A" fact={r.a} />
              <EvidenceSide side="B" fact={r.b} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function TypeBadge({ type }: { type: string }) {
  const color =
    type === "corroborates"
      ? "bg-ok/10 text-ok"
      : type === "contradicts"
        ? "bg-danger/10 text-danger"
        : "bg-accent-soft text-accent";
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-semibold uppercase ${color}`}>
      {type}
    </span>
  );
}

function EvidenceSide({
  side,
  fact,
}: {
  side: string;
  fact: Relation["a"];
}) {
  return (
    <div className="rounded-lg border border-line bg-background/50 p-3">
      <p className="font-mono text-[11px] uppercase text-muted">
        {side} · {fact.documentName || "document"}
      </p>
      <p className="mt-1 text-sm font-medium text-ink">{fact.claim}</p>
      <p className="mt-1 font-mono text-[11px] text-muted">
        {[fact.rawValue, fact.unit, fact.period, fact.scope].filter(Boolean).join(" · ")}
      </p>
      {fact.evidence && (
        <blockquote className="mt-2 border-l-2 border-line pl-2 text-xs text-muted">
          p.{fact.evidence.page ?? "?"} “{fact.evidence.quote}”
        </blockquote>
      )}
    </div>
  );
}
