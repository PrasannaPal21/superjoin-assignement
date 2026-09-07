"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { UploadZone } from "@/components/upload-zone";
import { GlobalDropZone } from "@/components/global-drop-zone";
import { ThemeToggle } from "@/components/theme-toggle";
import { DocumentSidebar } from "@/components/document-sidebar";
import { FactBrowser } from "@/components/fact-browser";
import { RelationPanel } from "@/components/relation-panel";
import { IssuesPanel } from "@/components/issues-panel";
import NumberFlow from "@number-flow/react";
import {
  AlertTriangle,
  FileStack,
  GitCompareArrows,
  Layers,
  TriangleAlert,
} from "lucide-react";

type Tab = "facts" | "compare" | "issues";

type DocumentDto = {
  id: string;
  filename: string;
  status: string;
  errorMessage: string | null;
};

type DocsPayload = {
  documents: DocumentDto[];
  ops: {
    jobsQueued: number;
    jobsRunning: number;
    factTypes: string[];
    counts?: { facts: number; relations: number; failures: number };
  };
};

export function AppShell() {
  const [tab, setTab] = useState<Tab>("facts");
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [selectedDocName, setSelectedDocName] = useState<string | null>(null);
  const [healthOk, setHealthOk] = useState<boolean | null>(null);
  const [docs, setDocs] = useState<DocumentDto[]>([]);
  const [counts, setCounts] = useState({ facts: 0, relations: 0, failures: 0 });
  const [jobsBusy, setJobsBusy] = useState(0);

  const bump = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    void fetch("/api/health")
      .then((r) => r.json())
      .then((d) => setHealthOk(Boolean(d.ok)))
      .catch(() => setHealthOk(false));
  }, [refreshKey]);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/documents")
      .then((r) => r.json())
      .then((d: DocsPayload) => {
        if (cancelled) return;
        setDocs(d.documents || []);
        if (d.ops?.counts) setCounts(d.ops.counts);
        setJobsBusy((d.ops?.jobsRunning || 0) + (d.ops?.jobsQueued || 0));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  // Live polling while the pipeline is busy so counts update without a manual refresh.
  useEffect(() => {
    if (jobsBusy <= 0) return;
    const id = setInterval(() => bump(), 3000);
    return () => clearInterval(id);
  }, [jobsBusy, bump]);

  const ready = docs.filter((d) => d.status === "ready").length;
  const processing = docs.filter((d) => d.status === "processing" || d.status === "queued").length;
  const failed = docs.filter((d) => d.status === "failed").length;
  const hasDocs = docs.length > 0;

  return (
    <div className="flex h-screen flex-col">
      {/* Drop PDFs anywhere on the page */}
      <GlobalDropZone onUploaded={() => bump()} />

      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-card px-4">
        <div className="flex items-center gap-2.5">
          <span className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Layers className="size-3.5" />
          </span>
          <span className="text-sm font-semibold tracking-tight">Fact Knowledge Layer</span>
        </div>

        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          {processing > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-warn-soft px-2.5 py-1 font-medium text-warn">
              <span className="size-1.5 animate-pulse rounded-full bg-warn" />
              {processing} processing
            </span>
          )}
          {failed > 0 && (
            <span className="hidden items-center gap-1.5 rounded-full bg-danger-soft px-2.5 py-1 font-medium text-danger sm:inline-flex">
              <TriangleAlert className="size-3" />
              {failed} failed
            </span>
          )}
          <span className="hidden tabular md:inline">
            {ready}/{docs.length} ready
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className={cn(
                "size-1.5 rounded-full",
                healthOk ? "bg-ok" : healthOk === false ? "bg-danger" : "bg-muted-foreground/40",
              )}
            />
            {healthOk === false ? "API key missing" : "System healthy"}
          </span>
          <ThemeToggle />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* ── Sidebar ──────────────────────────────────────────── */}
        <aside className="flex w-[280px] shrink-0 flex-col border-r border-border bg-sidebar">
          <div className="px-4 pt-4">
            <UploadZone onUploaded={() => bump()} />
          </div>
          <DocumentSidebar
            refreshKey={refreshKey}
            selectedId={selectedDocId}
            onSelect={(id, name) => {
              setSelectedDocId(id);
              setSelectedDocName(name);
            }}
          />
        </aside>

        {/* ── Main ─────────────────────────────────────────────── */}
        <section className="flex min-w-0 flex-1 flex-col">
          {/* Nav tabs */}
          <div className="flex shrink-0 items-center gap-1 border-b border-border bg-card px-4">
            {(
              [
                ["facts", "Facts", <FileStack key="i1" className="size-4" />, counts.facts],
                ["compare", "Compare", <GitCompareArrows key="i2" className="size-4" />, counts.relations],
                ["issues", "Issues", <AlertTriangle key="i3" className="size-4" />, counts.failures],
              ] as const
            ).map(([id, label, icon, n]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={cn(
                  "-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm transition-colors",
                  tab === id
                    ? "border-primary font-semibold text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {icon}
                {label}
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular",
                    tab === id ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground",
                  )}
                >
                  <NumberFlow value={n} />
                </span>
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="min-h-0 flex-1 overflow-auto px-6 py-4">
            {!hasDocs && tab === "facts" ? (
              <HeroEmptyState />
            ) : (
              <>
                {tab === "facts" && (
                  <FactBrowser
                    refreshKey={refreshKey}
                    documentId={selectedDocId}
                    documentName={selectedDocName}
                    onClearDocument={() => {
                      setSelectedDocId(null);
                      setSelectedDocName(null);
                    }}
                  />
                )}
                {tab === "compare" && <RelationPanel refreshKey={refreshKey} />}
                {tab === "issues" && <IssuesPanel refreshKey={refreshKey} />}
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function HeroEmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center pb-16">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl border border-border bg-card shadow-sm">
          <Layers className="size-7 text-accent-foreground" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Build your fact knowledge layer
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
          Add PDF filings and the pipeline extracts grounded facts — every number linked to the
          exact page it came from — then compares them across documents.
        </p>
        <ol className="mx-auto mt-6 max-w-xs space-y-2.5 text-left">
          {[
            ["Drop PDFs anywhere", "Drag files onto the page or use the panel on the left"],
            ["Watch extraction", "Progress updates live as facts are pulled"],
            ["Explore & compare", "Verify claims, spot conflicts across documents"],
          ].map(([title, desc], i) => (
            <li key={title} className="flex items-start gap-3">
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-semibold text-accent-foreground">
                {i + 1}
              </span>
              <span>
                <span className="block text-sm font-medium text-foreground">{title}</span>
                <span className="block text-xs text-muted-foreground">{desc}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
