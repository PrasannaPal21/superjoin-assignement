"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
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
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Pairwise links with evidence on both sides and an explicit rationale.
        </p>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="h-9 rounded-lg border border-input bg-card px-3 text-sm"
        >
          <option value="">All relations</option>
          <option value="corroborates">Corroborates</option>
          <option value="contradicts">Contradicts</option>
          <option value="reconciled">Reconciled</option>
        </select>
      </div>

      <RelationOverviewChart counts={counts} />

      <ScrollArea className="h-[min(60vh,640px)]">
        <div className="mt-1 space-y-3 pr-3">
          {relations.length === 0 && (
            <div className="rounded-xl border border-border bg-card p-8 text-sm text-muted-foreground">
              Relations appear after two or more documents finish processing.
            </div>
          )}
          {relations.map((r) => (
            <article
              key={r.id}
              className="rounded-xl border border-border bg-card p-4 shadow-sm"
            >
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <TypeBadge type={r.relationType} />
                <span className="font-mono text-[11px] text-muted-foreground">
                  {(r.confidence * 100).toFixed(0)}%
                </span>
                {r.contextTags.map((t) => (
                  <Badge key={t} variant="secondary" className="font-mono text-[10px]">
                    {t}
                  </Badge>
                ))}
              </div>
              <p className="mb-3 text-sm">{r.rationale}</p>
              <div className="grid gap-3 md:grid-cols-2">
                <EvidenceSide side="A" fact={r.a} />
                <EvidenceSide side="B" fact={r.b} />
              </div>
            </article>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

function TypeBadge({ type }: { type: string }) {
  const color =
    type === "corroborates"
      ? "bg-ok/15 text-ok border-ok/20"
      : type === "contradicts"
        ? "bg-danger/15 text-danger border-danger/20"
        : "bg-accent text-accent-foreground border-transparent";
  return (
    <Badge variant="outline" className={`uppercase ${color}`}>
      {type}
    </Badge>
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
    <div className="rounded-lg border border-border bg-muted/40 p-3">
      <p className="font-mono text-[11px] uppercase text-muted-foreground">
        {side} · {fact.documentName || "document"}
      </p>
      <p className="mt-1 text-sm font-medium">{fact.claim}</p>
      <p className="mt-1 font-mono text-[11px] text-muted-foreground">
        {[fact.rawValue, fact.unit, fact.period, fact.scope].filter(Boolean).join(" · ")}
      </p>
      {fact.evidence && (
        <blockquote className="mt-2 border-l-2 border-border pl-2 text-xs text-muted-foreground">
          p.{fact.evidence.page ?? "?"} “{fact.evidence.quote}”
        </blockquote>
      )}
    </div>
  );
}
