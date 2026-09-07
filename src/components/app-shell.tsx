"use client";

import { useState } from "react";
import { UploadPanel } from "@/components/upload-panel";
import { DocumentList } from "@/components/document-list";
import { FactBrowser } from "@/components/fact-browser";
import { RelationPanel } from "@/components/relation-panel";
import { DemoCasesPanel } from "@/components/demo-cases-panel";
import { FailureJournal } from "@/components/failure-journal";

export function AppShell() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 px-6 py-10 pb-16">
      <header className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
          Fact Knowledge Layer
        </p>
        <h1 className="max-w-3xl font-[family-name:var(--font-display)] text-4xl leading-tight text-ink sm:text-5xl">
          Facts grounded in evidence, linked across documents.
        </h1>
        <p className="max-w-2xl text-base text-muted">
          Extract numerical and semantic claims from PDFs, keep every claim tied to a
          quote, and surface corroboration, contradiction, and context-aware reconciliation.
        </p>
      </header>

      <UploadPanel onUploaded={() => setRefreshKey((k) => k + 1)} />
      <DocumentList refreshKey={refreshKey} />
      <FactBrowser refreshKey={refreshKey} />
      <RelationPanel refreshKey={refreshKey} />
      <DemoCasesPanel refreshKey={refreshKey} />
      <FailureJournal refreshKey={refreshKey} />
    </main>
  );
}
