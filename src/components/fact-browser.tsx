"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

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
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Claims with source evidence. Fact types grow as new kinds appear.
        </p>
        <div className="flex flex-wrap gap-2">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search claims…"
            className="w-48 bg-card"
          />
          <select
            value={factType}
            onChange={(e) => setFactType(e.target.value)}
            className="h-9 rounded-lg border border-input bg-card px-3 text-sm"
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

      <ScrollArea className="h-[min(70vh,720px)]">
        <div className="space-y-2 pr-3">
          {facts.length === 0 && (
            <div className="rounded-xl border border-border bg-card p-8 text-sm text-muted-foreground">
              No facts yet — process at least one PDF.
            </div>
          )}
          {facts.map((f) => (
            <article
              key={f.id}
              className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="bg-accent text-accent-foreground hover:bg-accent">
                  {f.factType}
                </Badge>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {(f.confidence * 100).toFixed(0)}%
                </span>
                {f.period && (
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {f.period}
                  </span>
                )}
                {f.scope && (
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {f.scope}
                  </span>
                )}
              </div>
              <p className="mt-2 text-sm font-medium">{f.claim}</p>
              {(f.rawValue || f.unit || f.entity) && (
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  {[f.entity, f.rawValue, f.unit].filter(Boolean).join(" · ")}
                </p>
              )}
              {f.evidence[0] && (
                <blockquote className="mt-3 border-l-2 border-primary/40 pl-3 text-sm text-muted-foreground">
                  <span className="font-mono text-[11px] text-primary">
                    p.{f.evidence[0].page ?? "?"}
                  </span>{" "}
                  “{f.evidence[0].quote}”
                </blockquote>
              )}
            </article>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
