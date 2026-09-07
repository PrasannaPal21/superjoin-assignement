"use client";

import { useEffect, useMemo, useState } from "react";

type Fact = {
  id: string;
  documentId: string;
  documentName: string | null;
  claim: string;
  rawValue: string | null;
  numericValue: number | null;
  unit: string | null;
  period: string | null;
  scope: string | null;
  entity: string | null;
  factType: string;
  confidence: number;
  evidence: { page: number | null; quote: string }[];
};

function displayValue(f: Fact): string {
  if (f.rawValue && f.unit) return `${f.rawValue} ${f.unit}`;
  if (f.rawValue) return f.rawValue;
  if (f.numericValue != null && f.unit) return `${f.numericValue} ${f.unit}`;
  if (f.numericValue != null) return String(f.numericValue);
  return "—";
}

function shortDoc(name: string | null): string {
  if (!name) return "—";
  return name.replace(/\.pdf$/i, "").replace(/^\d+-/, "").replace(/-/g, " ");
}

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
  const [openId, setOpenId] = useState<string | null>(null);

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
    }, 120);
    return () => clearTimeout(t);
  }, [factType, q, refreshKey, documentId]);

  const grouped = useMemo(() => {
    const map = new Map<string, Fact[]>();
    for (const f of facts) {
      const key = f.factType || "other";
      const list = map.get(key) || [];
      list.push(f);
      map.set(key, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [facts]);

  return (
    <div className="mx-auto max-w-5xl space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search value, period, claim…"
          className="h-8 w-56 rounded-md border border-input bg-card px-2.5 text-sm"
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
        <span className="text-xs text-muted-foreground">{facts.length} facts</span>
      </div>

      {facts.length === 0 && (
        <div className="rounded-md border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
          {documentId
            ? "Nothing extracted for this document yet."
            : "Add PDFs on the left. Extracted numbers and claims will list here, grouped by type."}
        </div>
      )}

      {grouped.map(([type, rows]) => (
        <section key={type} className="overflow-hidden rounded-md border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border bg-muted/50 px-3 py-1.5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {type.replace(/_/g, " ")}
            </h2>
            <span className="text-[11px] text-muted-foreground">{rows.length}</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Value</th>
                  <th className="px-3 py-2 font-medium">Period</th>
                  <th className="px-3 py-2 font-medium">Claim</th>
                  <th className="px-3 py-2 font-medium">Source</th>
                  <th className="px-3 py-2 font-medium">Document</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((f) => {
                  const open = openId === f.id;
                  const ev = f.evidence[0];
                  return (
                    <tr
                      key={f.id}
                      className="cursor-pointer border-b border-border/70 last:border-0 hover:bg-muted/40"
                      onClick={() => setOpenId(open ? null : f.id)}
                    >
                      <td className="px-3 py-2.5 align-top">
                        <div className="font-semibold tabular-nums text-primary">
                          {displayValue(f)}
                        </div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                          {(f.confidence * 100).toFixed(0)}% conf
                        </div>
                      </td>
                      <td className="px-3 py-2.5 align-top text-muted-foreground">
                        <div>{f.period || "—"}</div>
                        {f.scope && (
                          <div className="text-[11px]">{f.scope}</div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <div className="max-w-[280px]">{f.claim}</div>
                        {open && ev && (
                          <p className="mt-2 border-l-2 border-primary/30 pl-2 text-xs text-muted-foreground">
                            “{ev.quote}”
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-2.5 align-top font-mono text-xs text-muted-foreground">
                        {ev?.page != null ? `p.${ev.page}` : "—"}
                      </td>
                      <td
                        className="max-w-[160px] truncate px-3 py-2.5 align-top text-xs text-muted-foreground"
                        title={f.documentName || undefined}
                      >
                        {shortDoc(f.documentName)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      {facts.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          Click a row to expand the source quote.
        </p>
      )}
    </div>
  );
}
