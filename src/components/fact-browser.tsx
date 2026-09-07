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
  evidence: { id: string; page: number | null; quote: string }[];
};

export function FactBrowser({ refreshKey = 0 }: { refreshKey?: number }) {
  const [facts, setFacts] = useState<Fact[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [factType, setFactType] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    const params = new URLSearchParams();
    if (factType) params.set("factType", factType);
    if (q.trim()) params.set("q", q.trim());
    const handle = setTimeout(() => {
      void fetch(`/api/facts?${params}`)
        .then((r) => r.json())
        .then((data) => {
          setFacts(data.facts || []);
          setTypes(data.factTypes || []);
        });
    }, 200);
    return () => clearTimeout(handle);
  }, [factType, q, refreshKey]);

  return (
    <section className="rounded-2xl border border-line bg-panel p-6 backdrop-blur">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-2xl text-ink">
            Facts
          </h2>
          <p className="text-sm text-muted">
            Every claim stays linked to a source quote. Types grow as new kinds appear.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search claims…"
            className="rounded-lg border border-line bg-white/80 px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <select
            value={factType}
            onChange={(e) => setFactType(e.target.value)}
            className="rounded-lg border border-line bg-white/80 px-3 py-2 text-sm outline-none focus:border-accent"
          >
            <option value="">All types</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-3">
        {facts.length === 0 && (
          <p className="text-sm text-muted">No facts yet — process a PDF first.</p>
        )}
        {facts.map((f) => (
          <article
            key={f.id}
            className="rounded-xl border border-line bg-white/70 px-4 py-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-accent-soft px-2 py-0.5 font-mono text-[11px] text-accent">
                {f.factType}
              </span>
              <span className="font-mono text-[11px] text-muted">
                conf {(f.confidence * 100).toFixed(0)}%
              </span>
              {f.period && (
                <span className="font-mono text-[11px] text-muted">{f.period}</span>
              )}
              {f.scope && (
                <span className="font-mono text-[11px] text-muted">{f.scope}</span>
              )}
            </div>
            <p className="mt-2 text-sm font-medium text-ink">{f.claim}</p>
            {(f.rawValue || f.unit || f.entity) && (
              <p className="mt-1 font-mono text-xs text-muted">
                {[f.entity, f.rawValue, f.unit].filter(Boolean).join(" · ")}
              </p>
            )}
            {f.evidence[0] && (
              <blockquote className="mt-3 border-l-2 border-accent/40 pl-3 text-sm text-muted">
                <span className="font-mono text-[11px] text-accent">
                  p.{f.evidence[0].page ?? "?"}
                </span>{" "}
                “{f.evidence[0].quote}”
              </blockquote>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
