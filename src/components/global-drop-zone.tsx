"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { isPdf, uploadPdf, type UploadResult } from "@/lib/upload-client";
import { CheckCircle2, FileText, TriangleAlert, UploadCloud, X } from "lucide-react";

type FileState = {
  name: string;
  size: number;
  status: "waiting" | "uploading" | "done" | "error";
  message?: string;
};

/**
 * Drop files anywhere on the page to upload. Renders a full-screen overlay
 * while dragging, then an upload progress card. Toasts confirm each file.
 */
export function GlobalDropZone({ onUploaded }: { onUploaded?: (r: UploadResult) => void }) {
  const [dragActive, setDragActive] = useState(false);
  const [files, setFiles] = useState<FileState[] | null>(null);
  const [toasts, setToasts] = useState<
    { id: number; name: string; ok: boolean; deduped?: boolean }[]
  >([]);
  const depth = useRef(0);
  const toastId = useRef(0);

  // ── Window-level drag detection ─────────────────────────────
  useEffect(() => {
    const hasFiles = (e: DragEvent) =>
      Array.from(e.dataTransfer?.types ?? []).includes("Files");

    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current += 1;
      setDragActive(true);
    };
    const onOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault(); // required to allow dropping
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragActive(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current = 0;
      setDragActive(false);
      const dropped = Array.from(e.dataTransfer?.files ?? []);
      const pdfs = dropped.filter(isPdf);
      if (dropped.length > 0 && pdfs.length === 0) {
        setToasts((t) => [
          ...t,
          { id: ++toastId.current, name: "Only PDF files are supported", ok: false },
        ]);
        return;
      }
      if (pdfs.length > 0) startUploads(pdfs);
    };

    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Upload pipeline ─────────────────────────────────────────
  const startUploads = useCallback(
    async (pdfs: File[]) => {
      setFiles(pdfs.map((f) => ({ name: f.name, size: f.size, status: "waiting" })));
      for (let i = 0; i < pdfs.length; i++) {
        setFiles((prev) =>
          (prev ?? []).map((s, idx) => (idx === i ? { ...s, status: "uploading" } : s)),
        );
        try {
          const result = await uploadPdf(pdfs[i]);
          setFiles((prev) =>
            (prev ?? []).map((s, idx) => (idx === i ? { ...s, status: "done" } : s)),
          );
          setToasts((t) => [
            ...t,
            {
              id: ++toastId.current,
              name: pdfs[i].name,
              ok: true,
              deduped: result.deduped,
            },
          ]);
          onUploaded?.(result);
        } catch (err) {
          setFiles((prev) =>
            (prev ?? []).map((s, idx) =>
              idx === i
                ? {
                    ...s,
                    status: "error",
                    message: err instanceof Error ? err.message : "Upload failed",
                  }
                : s,
            ),
          );
          setToasts((t) => [
            ...t,
            { id: ++toastId.current, name: pdfs[i].name, ok: false },
          ]);
        }
      }
      // Let the user see the final state briefly, then clear.
      setTimeout(() => setFiles(null), 1800);
    },
    [onUploaded],
  );

  // Auto-dismiss toasts after 4s
  useEffect(() => {
    if (toasts.length === 0) return;
    const id = setTimeout(() => setToasts((t) => t.slice(1)), 4000);
    return () => clearTimeout(id);
  }, [toasts]);

  return (
    <>
      {/* ── Full-screen drag overlay ─────────────────────────── */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none fixed inset-0 z-50 transition-opacity duration-200",
          dragActive ? "opacity-100" : "opacity-0",
        )}
      >
        {/* Backdrop */}
        <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" />

        {/* Animated dashed frame that breathes while dragging */}
        <div
          className={cn(
            "absolute inset-3 rounded-2xl border-2 border-dashed border-accent-foreground/50 transition-transform duration-200",
            dragActive && "animate-pulse",
          )}
        />

        {/* Center card */}
        <div
          className={cn(
            "absolute left-1/2 top-1/2 w-[min(92vw,420px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-8 text-center shadow-2xl transition-all duration-200",
            dragActive ? "scale-100 opacity-100" : "scale-95 opacity-0",
          )}
        >
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-accent">
            <UploadCloud className="size-7 text-accent-foreground" />
          </div>
          <p className="text-base font-semibold text-foreground">Drop to add documents</p>
          <p className="mt-1 text-sm text-muted-foreground">
            PDFs are queued for extraction automatically
          </p>
        </div>
      </div>

      {/* ── Upload progress card ─────────────────────────────── */}
      {files && (() => {
        const done = files.filter((f) => f.status === "done").length;
        const current = Math.min(done + 1, files.length);
        return (
        <div className="animate-rise fixed bottom-4 right-4 z-50 w-80 overflow-hidden rounded-xl border border-border bg-card shadow-xl">
          <div className="flex items-center justify-between border-b border-border px-3.5 py-2.5">
            <span className="text-xs font-semibold text-foreground">
              {current === files.length && done === files.length
                ? "Uploads complete"
                : `Uploading ${current} of ${files.length}`}
            </span>
            <button
              type="button"
              onClick={() => setFiles(null)}
              className="rounded p-0.5 text-muted-foreground hover:text-foreground"
              aria-label="Dismiss"
            >
              <X className="size-3.5" />
            </button>
          </div>
          <ul className="max-h-56 divide-y divide-border/60 overflow-auto">
            {files.map((f, i) => (
              <li key={i} className="flex items-center gap-2.5 px-3.5 py-2">
                <FileText className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium text-foreground">
                    {f.name}
                  </span>
                  {f.status === "error" && (
                    <span className="block text-[11px] text-danger">{f.message}</span>
                  )}
                </span>
                {f.status === "uploading" && (
                  <span className="size-1.5 animate-pulse rounded-full bg-warn" />
                )}
                {f.status === "done" && (
                  <CheckCircle2 className="size-4 shrink-0 text-ok" />
                )}
                {f.status === "error" && (
                  <TriangleAlert className="size-4 shrink-0 text-danger" />
                )}
              </li>
            ))}
          </ul>
        </div>
        );
      })()}

      {/* ── Toasts ───────────────────────────────────────────── */}
      <div className="pointer-events-none fixed bottom-4 left-4 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "animate-rise pointer-events-auto flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5 shadow-lg",
              t.ok ? "border-border bg-card" : "border-danger/30 bg-danger-soft",
            )}
          >
            {t.ok ? (
              <CheckCircle2 className="size-4 shrink-0 text-ok" />
            ) : (
              <TriangleAlert className="size-4 shrink-0 text-danger" />
            )}
            <span className="min-w-0 max-w-[240px]">
              <span className="block truncate text-xs font-medium text-foreground">{t.name}</span>
              <span className="block text-[11px] text-muted-foreground">
                {t.ok
                  ? t.deduped
                    ? "Already processed — skipped as duplicate"
                    : "Queued for extraction"
                  : "Upload failed"}
              </span>
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
