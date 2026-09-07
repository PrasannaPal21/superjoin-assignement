"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { UploadZone } from "@/components/upload-zone";
import { DocumentSidebar } from "@/components/document-sidebar";
import { FactBrowser } from "@/components/fact-browser";
import { RelationPanel } from "@/components/relation-panel";
import { IssuesPanel } from "@/components/issues-panel";

type Tab = "facts" | "compare" | "issues";

export function AppShell() {
  const [tab, setTab] = useState<Tab>("facts");
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [selectedDocName, setSelectedDocName] = useState<string | null>(null);
  const [healthOk, setHealthOk] = useState<boolean | null>(null);
  const [docStats, setDocStats] = useState({ ready: 0, total: 0, running: 0 });

  const bump = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    void fetch("/api/health")
      .then((r) => r.json())
      .then((d) => setHealthOk(Boolean(d.ok)))
      .catch(() => setHealthOk(false));
  }, [refreshKey]);

  useEffect(() => {
    void fetch("/api/documents")
      .then((r) => r.json())
      .then((d) => {
        const docs = d.documents || [];
        setDocStats({
          total: docs.length,
          ready: docs.filter((x: { status: string }) => x.status === "ready").length,
          running: (d.ops?.jobsRunning || 0) + (d.ops?.jobsQueued || 0),
        });
      })
      .catch(() => undefined);
  }, [refreshKey]);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-11 items-center justify-between border-b border-border bg-card px-4">
        <span className="text-[15px] font-semibold text-primary">Fact Knowledge Layer</span>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>
            {docStats.ready}/{docStats.total} ready
            {docStats.running > 0 ? ` · ${docStats.running} running` : ""}
          </span>
          <span className="hidden sm:inline">·</span>
          <span className="hidden items-center gap-1.5 sm:inline-flex">
            <span
              className={cn(
                "inline-block h-1.5 w-1.5 rounded-full",
                healthOk ? "bg-ok" : healthOk === false ? "bg-danger" : "bg-border",
              )}
            />
            {healthOk === false ? "API key missing" : "system ok"}
          </span>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[280px] shrink-0 flex-col border-r border-border bg-card">
          <div className="border-b border-border p-3">
            <UploadZone
              onUploaded={() => {
                bump();
                setTab("facts");
              }}
            />
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

        <section className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-end justify-between gap-3 border-b border-border bg-card/80 px-4">
            <div className="flex items-center gap-0">
              {(
                [
                  ["facts", "Facts", "What was extracted"],
                  ["compare", "Compare", "Across documents"],
                  ["issues", "Issues", "Gaps & failures"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={cn(
                    "border-b-2 px-3 py-2.5 text-sm",
                    tab === id
                      ? "border-primary font-semibold text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {selectedDocName && tab === "facts" && (
              <button
                type="button"
                onClick={() => {
                  setSelectedDocId(null);
                  setSelectedDocName(null);
                }}
                className="mb-2 max-w-[240px] truncate rounded bg-accent px-2 py-1 text-xs text-accent-foreground"
                title="Clear document filter"
              >
                Filtered: {selectedDocName} ×
              </button>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-4">
            {tab === "facts" && (
              <FactBrowser refreshKey={refreshKey} documentId={selectedDocId} />
            )}
            {tab === "compare" && <RelationPanel refreshKey={refreshKey} />}
            {tab === "issues" && <IssuesPanel refreshKey={refreshKey} />}
          </div>
        </section>
      </div>
    </div>
  );
}
