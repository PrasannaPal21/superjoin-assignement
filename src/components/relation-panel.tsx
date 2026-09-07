"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type Side = {
  claim: string;
  documentName: string | null;
  evidence: { page: number | null; quote: string } | null;
  period: string | null;
  scope: string | null;
  unit: string | null;
  rawValue: string | null;
};

type Relation = {
  id: string;
  relationType: string;
  rationale: string | null;
  contextTags: string[];
  confidence: number;
  a: Side;
  b: Side;
};

const LABEL: Record<string, { title: string; hint: string; className: string }> = {
  corroborates: {
    title: "Agrees",
    hint: "Same underlying fact, different wording or docs",
    className: "bg-ok/15 text-ok",
  },
  contradicts: {
    title: "Conflicts",
    hint: "Values or claims disagree",
    className: "bg-danger/15 text-danger",
  },
  reconciled: {
    title: "Different context",
    hint: "Looks conflicting until time, scope, or units are considered",
    className: "bg-accent text-accent-foreground",
  },
};

function shortDoc(name: string | null): string {
  if (!name) return "document";
  return name.replace(/\.pdf$/i, "").replace(/^\d+-/, "").replace(/-/g, " ");
}

function valueLine(s: Side): string {
  const parts = [s.rawValue, s.unit, s.period, s.scope].filter(Boolean);
  return parts.length ? parts.join(" · ") : "—";
}

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
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["", "All", counts.corroborates + counts.contradicts + counts.reconciled],
            ["corroborates", "Agrees", counts.corroborates],
            ["contradicts", "Conflicts", counts.contradicts],
            ["reconciled", "Different context", counts.reconciled],
          ] as const
        ).map(([id, label, n]) => (
          <button
            key={id || "all"}
            type="button"
            onClick={() => setFilter(id)}
            className={cn(
              "rounded-md border px-2.5 py-1 text-xs",
              filter === id
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {label} ({n})
          </button>
        ))}
      </div>

      {relations.length === 0 && (
        <div className="rounded-md border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
          Need at least two finished PDFs before comparisons appear.
        </div>
      )}

      <ul className="space-y-3">
        {relations.map((r) => {
          const meta = LABEL[r.relationType] || {
            title: r.relationType,
            hint: "",
            className: "bg-muted text-foreground",
          };
          return (
            <li key={r.id} className="rounded-md border border-border bg-card p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "rounded px-2 py-0.5 text-xs font-semibold",
                    meta.className,
                  )}
                >
                  {meta.title}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {(r.confidence * 100).toFixed(0)}% · {meta.hint}
                </span>
                {r.contextTags.map((t) => (
                  <span
                    key={t}
                    className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                  >
                    {t}
                  </span>
                ))}
              </div>

              {r.rationale && <p className="mb-3 text-sm">{r.rationale}</p>}

              <div className="grid gap-2 md:grid-cols-2">
                <SideCard side="A" fact={r.a} />
                <SideCard side="B" fact={r.b} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SideCard({ side, fact }: { side: string; fact: Side }) {
  return (
    <div className="rounded border border-border bg-muted/30 p-2.5">
      <p className="text-[11px] text-muted-foreground">
        {side} · {shortDoc(fact.documentName)}
      </p>
      <p className="mt-1 text-base font-semibold tabular-nums text-primary">
        {valueLine(fact)}
      </p>
      <p className="mt-1 text-sm">{fact.claim}</p>
      {fact.evidence && (
        <p className="mt-2 text-xs text-muted-foreground">
          <span className="font-mono">p.{fact.evidence.page ?? "?"}</span>{" "}
          {fact.evidence.quote.length > 160
            ? `${fact.evidence.quote.slice(0, 160)}…`
            : fact.evidence.quote}
        </p>
      )}
    </div>
  );
}
