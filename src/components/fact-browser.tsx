"use client";

import { useEffect, useState } from "react";

type Fact = {
  id: string;
  documentId: string;
  claim: string;
  rawValue: string | null;
  unit: string | null;
  period: string | null;
  scope: string | null;
  entity: string | null;
  factType: string;
  confidence: number;
  evidence: { page: number | null; quote: string }[];
};

export function FactBrowser({
  refreshKey = 0,
  documentId = null,
}: {
  refreshKey?: number;
  documentId?: string | null;
}) {
  const [facts, setFacts] = useState<Fact[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [factType, setFactType] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    const params = new URLSearchParams();
    if (documentId) params.set("documentId", documentId);
    if (factType) params.set("factType", factType);
    if (q.trim()) params.set("q", q.trim());
    const t = setTimeout(() => {
      void fetch(`/api/facts?${params}`)
        .then((r) => r.json())
        .then((data) => {
          setFacts(data.facts || []);
          setTypes(data.factTypes || []);
        });
    }, 150);
    return () => clearTimeout(t);
  }, [factType, q, refreshKey, documentId]);

  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter claims"
          className="h-8 w-48 rounded-md border border-input bg-card px-2 text-sm"
        />
        <select
          value={factType}
          onChange={(e) => setFactType(e.target.value)}
          className="h-8 rounded-md border border-input bg-card px-2 text-sm"
        >
          <option value="">All types</option>
          {types.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground">{facts.length} shown</span>
      </div>

      {facts.length === 0 && (
        <p className="py-12 text-center text-sm text-muted-foreground">
          {documentId
            ? "No facts for this document yet (still processing, or nothing extracted)."
            : "Upload a PDF on the left. Facts with source quotes show up here."}
        </p>
      )}

      <ul className="divide-y divide-border rounded-md border border-border bg-card">
        {facts.map((f) => (
          <li key={f.id} className="px-3 py-3">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
              <span className="font-mono uppercase text-foreground/70">{f.factType}</span>
              <span>{(f.confidence * 100).toFixed(0)}%</span>
              {f.period && <span>{f.period}</span>}
              {f.scope && <span>{f.scope}</span>}
            </div>
            <p className="mt-1 text-sm">{f.claim}</p>
            {(f.entity || f.rawValue || f.unit) && (
              <p className="mt-1 font-mono text-xs text-muted-foreground">
                {[f.entity, f.rawValue, f.unit].filter(Boolean).join(" · ")}
              </p>
            )}
            {f.evidence[0] && (
              <p className="mt-2 border-l-2 border-border pl-2 text-xs text-muted-foreground">
                <span className="font-mono">p.{f.evidence[0].page ?? "?"}</span>{" "}
                {f.evidence[0].quote}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
