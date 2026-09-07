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
  const [healthOk, setHealthOk] = useState<boolean | null>(null);

  const bump = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    void fetch("/api/health")
      .then((r) => r.json())
      .then((d) => setHealthOk(Boolean(d.ok)))
      .catch(() => setHealthOk(false));
  }, [refreshKey]);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-12 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold tracking-tight">Fact Knowledge Layer</span>
          <span className="hidden text-xs text-muted-foreground sm:inline">
            PDFs → grounded facts → cross-doc compare
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span
            className={cn(
              "inline-block h-1.5 w-1.5 rounded-full",
              healthOk ? "bg-ok" : healthOk === false ? "bg-danger" : "bg-border",
            )}
          />
          {healthOk === null ? "…" : healthOk ? "ready" : "check GROQ_API_KEY"}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-72 shrink-0 flex-col border-r border-border bg-card">
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
            onSelect={setSelectedDocId}
          />
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-1 border-b border-border px-3">
            {(
              [
                ["facts", "Facts"],
                ["compare", "Compare"],
                ["issues", "Issues"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={cn(
                  "border-b-2 px-3 py-2.5 text-sm transition-colors",
                  tab === id
                    ? "border-foreground font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
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
