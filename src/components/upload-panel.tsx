"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Upload } from "lucide-react";
import { OrbitLoader } from "@/components/ui/orbit-loader";

type UploadResult = {
  document: { id: string; filename: string; status: string };
  job: { id: string; status: string };
};

export function UploadPanel({
  onUploaded,
}: {
  onUploaded?: (result: UploadResult) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<UploadResult | null>(null);

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
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="rounded-2xl border border-line bg-panel p-6 backdrop-blur"
    >
      <div className="mb-4">
        <h2 className="font-[family-name:var(--font-display)] text-2xl text-ink">
          Upload a PDF
        </h2>
        <p className="mt-1 max-w-xl text-sm text-muted">
          Drop any PDF. Facts are extracted with evidence, then compared against the
          existing knowledge layer — without rebuilding older documents.
        </p>
      </div>

      <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line bg-white/50 px-6 py-10 transition hover:border-accent hover:bg-accent-soft/40">
        <Upload className="h-6 w-6 text-accent" />
        <span className="text-sm font-medium text-ink">Choose PDF or drop here</span>
        <span className="text-xs text-muted">Validated by extension + magic bytes</span>
        <input
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          disabled={busy}
          onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
        />
      </label>

      <div className="mt-4 min-h-8">
        {busy && <OrbitLoader label="Uploading and queuing…" />}
        {error && <p className="text-sm text-danger">{error}</p>}
        {last && !busy && (
          <p className="font-mono text-xs text-muted">
            queued {last.document.filename} · job {last.job.id.slice(0, 8)}
          </p>
        )}
      </div>
    </motion.section>
  );
}
