"use client";

import { useCallback, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/lib/format";
import { FilePlus2, Loader2, TriangleAlert, UploadCloud } from "lucide-react";

type UploadResult = {
  document: { id: string; filename: string };
  deduped?: boolean;
};

export function UploadZone({
  onUploaded,
  compact = false,
}: {
  onUploaded?: (result: UploadResult) => void;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUploaded, setLastUploaded] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const send = useCallback(
    async (file: File) => {
      setBusy(true);
      setError(null);
      try {
        const body = new FormData();
        body.append("file", file);
        const res = await fetch("/api/upload", { method: "POST", body });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Upload failed");
        setLastUploaded(file.name);
        onUploaded?.(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setBusy(false);
      }
    },
    [onUploaded],
  );

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const pdfs = Array.from(files ?? []).filter(
        (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"),
      );
      if (pdfs.length === 0) {
        setError("Please choose PDF files.");
        return;
      }
      // Sequential keeps MAX_CONCURRENT_JOBS honest; uploads are fast, processing queues.
      void (async () => {
        for (const f of pdfs) await send(f);
      })();
    },
    [send],
  );

  return (
    <div>
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (!busy) handleFiles(e.dataTransfer.files);
        }}
        className={cn(
          "group flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed bg-muted/40 px-3 text-center transition-colors",
          compact ? "py-3" : "py-5",
          dragOver
            ? "border-primary/60 bg-accent/60"
            : "border-border hover:border-primary/40 hover:bg-muted",
        )}
      >
        {busy ? (
          <>
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
            <span className="text-xs font-medium text-foreground">Uploading…</span>
          </>
        ) : (
          <>
            <UploadCloud
              className={cn(
                "size-5 text-muted-foreground transition-colors group-hover:text-foreground",
                dragOver && "text-accent-foreground",
              )}
            />
            <span className="text-xs font-medium text-foreground">
              {dragOver ? "Drop PDFs to add" : "Add documents"}
            </span>
            {!compact && (
              <span className="text-[11px] text-muted-foreground">
                Drag & drop or click · PDF up to {formatBytes(40 * 1024 * 1024)}
              </span>
            )}
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          className="hidden"
          disabled={busy}
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </label>

      {lastUploaded && !busy && !error && (
        <p className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
          <FilePlus2 className="size-3 text-ok" />
          <span className="truncate">{lastUploaded}</span> queued for extraction
        </p>
      )}
      {error && (
        <p className="mt-2 flex items-start gap-1 text-[11px] text-danger">
          <TriangleAlert className="mt-px size-3 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
