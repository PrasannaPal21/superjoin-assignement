"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { isPdf, uploadPdf, type UploadResult } from "@/lib/upload-client";
import { FilePlus2, Loader2, TriangleAlert, UploadCloud } from "lucide-react";

export function UploadZone({
  onUploaded,
  compact = false,
}: {
  onUploaded?: (result: UploadResult) => void;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUploaded, setLastUploaded] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | null) {
    const pdfs = Array.from(files ?? []).filter(isPdf);
    if (pdfs.length === 0) {
      setError("Please choose PDF files.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Sequential keeps MAX_CONCURRENT_JOBS honest; uploads are fast, processing queues.
      for (const f of pdfs) {
        const result = await uploadPdf(f);
        setLastUploaded(f.name);
        onUploaded?.(result);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <label
        className={cn(
          "group flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed bg-muted/40 px-3 text-center transition-colors",
          compact ? "py-3" : "py-5",
          "border-border hover:border-primary/40 hover:bg-muted",
        )}
      >
        {busy ? (
          <>
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
            <span className="text-xs font-medium text-foreground">Uploading…</span>
          </>
        ) : (
          <>
            <UploadCloud className="size-5 text-muted-foreground transition-colors group-hover:text-foreground" />
            <span className="text-xs font-medium text-foreground">Add documents</span>
            {!compact && (
              <span className="text-[11px] text-muted-foreground">
                Click to browse — or drop PDFs anywhere on this page
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
            void handleFiles(e.target.files);
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
