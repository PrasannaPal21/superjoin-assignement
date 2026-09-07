"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { prettyType, shortDocName } from "@/lib/format";
import { CheckCircle2, GitCompareArrows, Scale, Shuffle, TriangleAlert } from "lucide-react";

type Side = {
  claim: string;
  documentName: string | null;
  evidence: { page: number | null; quote: string } | null;
  period: string | null;
  scope: string | null;
  unit: string | null;
  rawValue: string | null;
  factType?: string;
  confidence?: number;
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

const META: Record<
  string,
  { title: string; hint: string; chip: string; icon: React.ReactNode }
> = {
  corroborates: {
    title: "Agrees",
    hint: "Same fact, confirmed by another document",
    chip: "bg-ok-soft text-ok",
    icon: <CheckCircle2 className="size-3.5" />,
  },
  contradicts: {
    title: "Conflicts",
    hint: "Documents disagree on this value",
    chip: "bg-danger-soft text-danger",
    icon: <TriangleAlert className="size-3.5" />,
  },
  reconciled: {
    title: "Different context",
    hint: "Explained by time, scope, or unit differences",
    chip: "bg-accent text-accent-foreground",
    icon: <Scale className="size-3.5" />,
  },
};

function valueLine(s: Side): string {
  const parts = [s.rawValue, s.unit].filter(Boolean);
  return parts.length ? parts.join(" ") : "—";
}

function metaLine(s: Side): string {
  return [s.period, s.scope].filter(Boolean).join(" · ");
}

export function RelationPanel({ refreshKey = 0 }: { refreshKey?: number }) {
  const [relations, setRelations] = useState<Relation[]>([]);
  const [counts, setCounts] = useState({ corroborates: 0, contradicts: 0, reconciled: 0 });
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = filter ? `?type=${filter}` : "";
    void fetch(`/api/relations${params}`)
      .then((r) => r.json())
      .then((data) => {
        setRelations(data.relations || []);
        if (!filter && data.counts) setCounts(data.counts);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [filter, refreshKey]);

  const total = counts.corroborates + counts.contradicts + counts.reconciled;

  return (
    <div className="mx-auto max-w-4xl">
      {/* Summary + filter chips */}
      <div className="flex flex-wrap items-center gap-2 pb-4 pt-1">
        <div className="mr-2 flex items-center gap-1.5 text-sm text-muted-foreground">
          <GitCompareArrows className="size-4" />
          <span className="tabular font-medium text-foreground">{total}</span> comparisons
        </div>
        {(
          [
            ["", "All", total, <GitCompareArrows key="i-all" className="size-3.5" />],
            ["corroborates", "Agrees", counts.corroborates, <CheckCircle2 key="i-c" className="size-3.5" />],
            ["contradicts", "Conflicts", counts.contradicts, <TriangleAlert key="i-x" className="size-3.5" />],
            ["reconciled", "Different context", counts.reconciled, <Scale key="i-r" className="size-3.5" />],
          ] as const
        ).map(([id, label, n, icon]) => (
          <button
            key={id || "all"}
            type="button"
            onClick={() => setFilter(id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              filter === id
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:border-foreground/20 hover:text-foreground",
            )}
          >
            {icon}
            {label}
            <span className={cn("tabular", filter === id ? "opacity-80" : "opacity-60")}>{n}</span>
          </button>
        ))}
      </div>

      {loading && relations.length === 0 && (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <div key={i} className="shimmer h-36 rounded-xl" />
          ))}
        </div>
      )}

      {relations.length === 0 && !loading && (
        <div className="rounded-xl border border-dashed bg-card px-6 py-14 text-center">
          <GitCompareArrows className="mx-auto mb-3 size-8 text-muted-foreground/50" />
          <p className="text-sm font-medium text-foreground">
            {filter
              ? "No comparisons of this type yet."
              : "Upload two or more documents to unlock cross-document comparisons."}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            The pipeline matches similar facts and explains how they relate — agreement, conflict, or context differences.
          </p>
        </div>
      )}

      <ul className="space-y-4">
        {relations.map((r) => {
          const meta = META[r.relationType] ?? {
            title: r.relationType,
            hint: "",
            chip: "bg-muted text-foreground",
            icon: <Shuffle className="size-3.5" />,
          };
          return (
            <li
              key={r.id}
              className="card-lift animate-rise overflow-hidden rounded-xl border border-border bg-card"
            >
              {/* Header: verdict + rationale */}
              <div className="flex flex-wrap items-center gap-2 border-b border-border/70 bg-muted/30 px-4 py-2.5">
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold",
                    meta.chip,
                  )}
                >
                  {meta.icon}
                  {meta.title}
                </span>
                <span className="text-xs text-muted-foreground">{meta.hint}</span>
                <span className="ml-auto text-[11px] tabular text-muted-foreground">
                  {(r.confidence * 100).toFixed(0)}% confidence
                </span>
              </div>

              <div className="px-4 py-3">
                {r.rationale && (
                  <p className="mb-3 border-l-2 border-accent pl-3 text-sm leading-relaxed text-foreground/90">
                    {r.rationale}
                  </p>
                )}

                {/* A vs B grid */}
                <div className="grid gap-3 md:grid-cols-2">
                  <SideCard side={r.a} label="A" />
                  <SideCard side={r.b} label="B" />
                </div>

                {r.contextTags.length > 0 && (
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-muted-foreground">Context:</span>
                    {r.contextTags.map((t) => (
                      <span
                        key={t}
                        className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SideCard({ side, label }: { side: Side; label: "A" | "B" }) {
  const doc = shortDocName(side.documentName);
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex items-center gap-2">
        <span className="flex size-5 items-center justify-center rounded bg-foreground/80 text-[10px] font-bold text-background">
          {label}
        </span>
        <span className="truncate text-[11px] font-medium text-muted-foreground">{doc}</span>
        {side.evidence?.page != null && (
          <span className="ml-auto shrink-0 rounded bg-accent px-1.5 py-0.5 font-mono text-[10px] font-medium text-accent-foreground">
            p.{side.evidence.page}
          </span>
        )}
      </div>
      <p className="mt-2 text-lg font-semibold tabular leading-tight text-foreground">
        {valueLine(side)}
      </p>
      <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{metaLine(side) || "—"}</p>
      <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-foreground/80">{side.claim}</p>
      {side.evidence && (
        <p className="mt-2 border-l-2 border-border pl-2 text-[11px] leading-relaxed text-muted-foreground">
          “{side.evidence.quote.length > 140 ? `${side.evidence.quote.slice(0, 140)}…` : side.evidence.quote}”
        </p>
      )}
      {side.factType && (
        <p className="mt-2 text-[10px] uppercase tracking-wider text-muted-foreground/70">
          {prettyType(side.factType)}
        </p>
      )}
    </div>
  );
}
