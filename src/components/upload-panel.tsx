"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Upload } from "lucide-react";
import Loader from "@/components/kokonutui/loader";

type UploadResult = {
  document: { id: string; filename: string; status: string };
  job: { id: string; status: string } | null;
  deduped?: boolean;
  message?: string;
};

export function UploadPanel({
  onUploaded,
}: {
  onUploaded?: (result: UploadResult) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<UploadResult | null>(null);
  const [dragOver, setDragOver] = useState(false);

  async function onFileChange(file: File | null) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setLast(data);
      onUploaded?.(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h2 className="font-[family-name:var(--font-display)] text-xl">Add document</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          PDF only. Validated by magic bytes, size-capped, content-hashed for dedupe.
          New documents extend the knowledge layer without rebuilding existing facts.
        </p>

        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            void onFileChange(e.dataTransfer.files?.[0] ?? null);
          }}
          className={`mt-5 flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-14 transition ${
            dragOver
              ? "border-primary bg-accent"
              : "border-border bg-muted/40 hover:border-primary/50 hover:bg-accent/50"
          }`}
        >
          <Upload className="h-6 w-6 text-primary" />
          <span className="text-sm font-medium">Drop a PDF or browse</span>
          <span className="rounded-md bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground">
            Select file
          </span>
          <input
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            disabled={busy}
            onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
          />
        </label>

        {busy && (
          <Loader
            className="mt-4 py-4"
            size="sm"
            title="Queuing document"
            subtitle="Validating and enqueueing for extraction"
          />
        )}
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        {last && !busy && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-3 font-mono text-xs text-muted-foreground"
          >
            {last.deduped ? "deduped · " : "queued · "}
            {last.document.filename}
            {last.job ? ` · job ${last.job.id.slice(0, 8)}` : ""}
          </motion.p>
        )}
      </div>
    </div>
  );
}
