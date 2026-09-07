"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { prettyType, shortDocName } from "@/lib/format";
import { ChevronDown, Quote, Search, X } from "lucide-react";

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

export function FactBrowser({
  refreshKey = 0,
  documentId = null,
  documentName = null,
  onClearDocument,
}: {
  refreshKey?: number;
  documentId?: string | null;
  documentName?: string | null;
  onClearDocument?: () => void;
}) {
  const [facts, setFacts] = useState<Fact[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [factType, setFactType] = useState("");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams();
    if (documentId) params.set("documentId", documentId);
    if (factType) params.set("factType", factType);
    if (q.trim()) params.set("q", q.trim());
    const t = setTimeout(() => {
      setLoading(true);
      void fetch(`/api/facts?${params}`)
        .then((r) => r.json())
        .then((data) => {
          setFacts(data.facts || []);
          setTypes(data.factTypes || []);
        })
        .catch(() => undefined)
        .finally(() => setLoading(false));
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

  const searching = q.trim() !== "" || factType !== "" || Boolean(documentId);

  return (
    <div className="mx-auto max-w-5xl">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 pb-4 pt-1">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search claims, values, periods…"
            className="h-8 w-64 rounded-lg border border-input bg-card pl-8 pr-2.5 text-sm placeholder:text-muted-foreground/70 focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
          />
        </div>
        <select
          value={factType}
          onChange={(e) => setFactType(e.target.value)}
          className="h-8 cursor-pointer rounded-lg border border-input bg-card px-2.5 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
        >
          <option value="">All types</option>
          {types.map((t) => (
            <option key={t} value={t}>
              {prettyType(t)}
            </option>
          ))}
        </select>
        {documentName && (
          <button
            type="button"
            onClick={onClearDocument}
            className="inline-flex h-8 items-center gap-1 rounded-lg bg-accent px-2.5 text-xs font-medium text-accent-foreground hover:bg-accent/80"
            title="Clear document filter"
          >
            {shortDocName(documentName)}
            <X className="size-3" />
          </button>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {loading ? "Loading…" : `${facts.length} fact${facts.length === 1 ? "" : "s"}`}
        </span>
      </div>

      {/* Empty states */}
      {facts.length === 0 && !loading && (
        <div className="rounded-xl border border-dashed bg-card px-6 py-14 text-center">
          <p className="text-sm font-medium text-foreground">
            {searching
              ? "No facts match these filters."
              : documentId
                ? "No facts extracted from this document yet."
                : "Facts will appear here once a document finishes processing."}
          </p>
          {searching && (
            <button
              type="button"
              onClick={() => {
                setQ("");
                setFactType("");
              }}
              className="mt-3 text-xs font-medium text-accent-foreground underline-offset-4 hover:underline"
            >
              Clear search & filters
            </button>
          )}
        </div>
      )}

      {loading && facts.length === 0 && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="shimmer h-20 rounded-xl" />
          ))}
        </div>
      )}

      {/* Grouped fact sections */}
      {grouped.map(([type, rows]) => (
        <section
          key={type}
          className="mb-4 overflow-hidden rounded-xl border border-border bg-card"
        >
          <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-2">
            <h2 className="text-xs font-semibold capitalize tracking-wide text-foreground">
              {prettyType(type)}
            </h2>
            <span className="text-[11px] tabular text-muted-foreground">{rows.length}</span>
          </div>

          <ul className="divide-y divide-border/70">
            {rows.map((f) => {
              const open = openId === f.id;
              const evs = f.evidence.length > 0 ? f.evidence : [];
              return (
                <li key={f.id} className={cn(open && "bg-muted/30")}>
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : f.id)}
                    className="grid w-full grid-cols-[130px_110px_1fr_auto] items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40 max-md:grid-cols-[1fr_auto]"
                    aria-expanded={open}
                  >
                    {/* Value + confidence */}
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] font-semibold tabular text-foreground">
                        {displayValue(f)}
                      </span>
                      <ConfidenceBar value={f.confidence} />
                    </span>

                    {/* Period / scope */}
                    <span className="min-w-0 text-xs text-muted-foreground">
                      <span className="block truncate font-medium text-foreground/80">
                        {f.period || "—"}
                      </span>
                      {f.scope && (
                        <span className="mt-0.5 block truncate font-mono text-[10px]">
                          {f.scope}
                        </span>
                      )}
                    </span>

                    {/* Claim + doc chip (Perplexity-style evidence chip) */}
                    <span className="min-w-0">
                      <span className="line-clamp-2 block text-sm leading-snug text-foreground">
                        {f.claim}
                      </span>
                      <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {f.documentName && (
                          <span className="inline-flex max-w-[220px] items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                            <span className="truncate">{shortDocName(f.documentName)}</span>
                            {evs[0]?.page != null && (
                              <span className="font-mono text-[10px] text-accent-foreground">
                                p.{evs[0].page}
                              </span>
                            )}
                          </span>
                        )}
                      </span>
                    </span>

                    <ChevronDown
                      className={cn(
                        "mt-1 size-4 shrink-0 text-muted-foreground transition-transform",
                        open && "rotate-180",
                      )}
                    />
                  </button>

                  {/* Evidence panel */}
                  {open && evs.length > 0 && (
                    <div className="animate-rise border-t border-border/60 bg-muted/20 px-4 py-3 max-md:mx-4 max-md:mb-3 max-md:rounded-lg">
                      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        <Quote className="size-3" /> Evidence from the source
                      </p>
                      <ul className="space-y-2">
                        {evs.map((e, i) => (
                          <li key={i} className="flex gap-3">
                            {e.page != null && (
                              <span className="mt-px shrink-0 rounded bg-accent px-1.5 py-0.5 font-mono text-[10px] font-medium text-accent-foreground">
                                p.{e.page}
                              </span>
                            )}
                            <p className="border-l-2 border-accent pl-2.5 text-xs leading-relaxed text-foreground/80">
                              “{e.quote}”
                            </p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {facts.length > 0 && (
        <p className="pb-2 text-center text-[11px] text-muted-foreground">
          Click any fact to see the exact quote it came from.
        </p>
      )}
    </div>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  const v = Math.max(0, Math.min(1, value));
  const color = v >= 0.8 ? "bg-ok" : v >= 0.5 ? "bg-warn" : "bg-danger";
  return (
    <span className="mt-1.5 flex items-center gap-1.5">
      <span className="h-1 w-8 overflow-hidden rounded-full bg-muted">
        <span
          className={cn("block h-full rounded-full", color)}
          style={{ width: `${Math.round(v * 100)}%` }}
        />
      </span>
      <span className="text-[10px] tabular text-muted-foreground">
        {Math.round(v * 100)}%
      </span>
    </span>
  );
}
