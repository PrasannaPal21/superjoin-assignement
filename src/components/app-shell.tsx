"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import {
  FileText,
  GitCompareArrows,
  Layers3,
  ScrollText,
  Upload,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { UploadPanel } from "@/components/upload-panel";
import { DocumentList } from "@/components/document-list";
import { FactBrowser } from "@/components/fact-browser";
import { RelationPanel } from "@/components/relation-panel";
import { FailureJournal } from "@/components/failure-journal";
import { QualityReviewPanel } from "@/components/quality-review-panel";

type NavId = "ingest" | "documents" | "facts" | "relations" | "quality" | "ops";

const NAV: { id: NavId; label: string; icon: typeof Upload; hint: string }[] = [
  { id: "ingest", label: "Ingest", icon: Upload, hint: "Upload PDFs into the layer" },
  { id: "documents", label: "Documents", icon: FileText, hint: "Processing status" },
  { id: "facts", label: "Facts", icon: Layers3, hint: "Grounded claims" },
  { id: "relations", label: "Relations", icon: GitCompareArrows, hint: "Cross-document links" },
  { id: "quality", label: "Quality", icon: ScrollText, hint: "Review edge cases" },
  { id: "ops", label: "Ops", icon: Activity, hint: "Failures and health" },
];

export function AppShell() {
  const [tab, setTab] = useState<NavId>("ingest");
  const [refreshKey, setRefreshKey] = useState(0);
  const [health, setHealth] = useState<{
    ok: boolean;
    model?: string;
    configured?: boolean;
  } | null>(null);

  useEffect(() => {
    void fetch("/api/health")
      .then(async (r) => {
        const data = await r.json();
        setHealth({
          ok: Boolean(data.ok),
          model: data.llm?.model,
          configured: data.llm?.configured,
        });
      })
      .catch(() => setHealth({ ok: false, configured: false }));
  }, [refreshKey]);

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground">
        <div className="px-5 py-6">
          <p className="font-[family-name:var(--font-display)] text-xl tracking-tight">
            Factlayer
          </p>
          <p className="mt-1 text-xs text-sidebar-foreground/60">Knowledge ingest</p>
        </div>
        <Separator className="bg-sidebar-border" />
        <nav className="flex flex-1 flex-col gap-1 p-3">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="flex flex-col">
                  <span className="font-medium">{item.label}</span>
                  <span className="text-[11px] opacity-60">{item.hint}</span>
                </span>
              </button>
            );
          })}
        </nav>
        <div className="space-y-2 border-t border-sidebar-border p-4 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sidebar-foreground/60">LLM</span>
            <Badge
              variant="outline"
              className={cn(
                "border-sidebar-border text-[10px]",
                health?.configured
                  ? "bg-ok/20 text-sidebar-foreground"
                  : "bg-danger/20 text-sidebar-foreground",
              )}
            >
              {health?.configured ? "configured" : "missing key"}
            </Badge>
          </div>
          <p className="truncate font-mono text-[10px] text-sidebar-foreground/50">
            {health?.model || "—"}
          </p>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border bg-card/70 px-6 py-4 backdrop-blur">
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-2xl text-foreground">
              {NAV.find((n) => n.id === tab)?.label}
            </h1>
            <p className="text-sm text-muted-foreground">
              {NAV.find((n) => n.id === tab)?.hint}
            </p>
          </div>
        </header>

        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22 }}
          className="flex-1 p-6"
        >
          {tab === "ingest" && (
            <UploadPanel
              onUploaded={() => {
                setRefreshKey((k) => k + 1);
                setTab("documents");
              }}
            />
          )}
          {tab === "documents" && <DocumentList refreshKey={refreshKey} />}
          {tab === "facts" && <FactBrowser refreshKey={refreshKey} />}
          {tab === "relations" && <RelationPanel refreshKey={refreshKey} />}
          {tab === "quality" && <QualityReviewPanel refreshKey={refreshKey} />}
          {tab === "ops" && <FailureJournal refreshKey={refreshKey} />}
        </motion.div>
      </main>
    </div>
  );
}
