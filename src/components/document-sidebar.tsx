"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { StatusIcon, StageLine, StatusPill } from "@/components/status-pill";
import { formatBytes, shortDocName } from "@/lib/format";

type JobInfo = {
  id: string;
  status: string;
  stage: string | null;
  current: number;
  total: number;
};

type Doc = {
  id: string;
  filename: string;
  status: string;
  pageCount: number | null;
  byteSize: number;
  errorMessage: string | null;
  job: JobInfo | null;
};

export function DocumentSidebar({
  refreshKey = 0,
  selectedId,
  onSelect,
}: {
  refreshKey?: number;
  selectedId: string | null;
  onSelect: (id: string | null, name: string | null) => void;
}) {
  const [docs, setDocs] = useState<Doc[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/documents");
      const data = await res.json();
      setDocs(data.documents || []);
    } catch {
      // transient network error — next poll will recover
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 2000);
    return () => clearInterval(id);
  }, [load, refreshKey]);

  const busyCount = docs.filter((d) => d.status === "processing" || d.status === "queued").length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between px-4 pb-2 pt-4">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Documents
        </span>
        <span className="text-[11px] text-muted-foreground">
          {busyCount > 0 ? (
            <span className="inline-flex items-center gap-1">
              <span className="size-1.5 animate-pulse rounded-full bg-warn" />
              {busyCount} in pipeline
            </span>
          ) : (
            docs.length > 0 && `${docs.length}`
          )}
        </span>
      </div>

      <ul className="flex-1 space-y-1 overflow-auto px-3 pb-3">
        {docs.length === 0 && (
          <li className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
            No documents yet.
            <br />
            Add your first PDF above.
          </li>
        )}
        {docs.map((d) => {
          const active = selectedId === d.id;
          const processing = d.status === "processing";
          return (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => onSelect(active ? null : d.id, active ? null : d.filename)}
                className={cn(
                  "w-full rounded-lg border px-3 py-2.5 text-left transition-colors",
                  active
                    ? "border-accent bg-accent"
                    : "border-transparent hover:border-border hover:bg-muted/60",
                )}
                title={d.filename}
              >
                <div className="flex items-start gap-2.5">
                  <span className="mt-0.5 shrink-0">
                    <StatusIcon status={d.status} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block truncate text-[13px] font-medium leading-snug",
                        active && "text-accent-foreground",
                      )}
                    >
                      {shortDocName(d.filename)}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                      {d.status !== "processing" && <StatusPill status={d.status} />}
                      {d.pageCount != null && <span>{d.pageCount} pages</span>}
                      {d.byteSize > 0 && <span>{formatBytes(d.byteSize)}</span>}
                    </span>
                    {processing && d.job && (
                      <span className="mt-1.5 block">
                        <ProgressLine stage={d.job.stage} current={d.job.current} total={d.job.total} />
                      </span>
                    )}
                    {d.errorMessage && (
                      <span className="mt-1 block line-clamp-2 text-[11px] text-danger">
                        {d.errorMessage}
                      </span>
                    )}
                  </span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      <p className="border-t border-border px-4 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
        Select a document to focus the facts view on it.
      </p>
    </div>
  );
}

function ProgressLine({
  stage,
  current,
  total,
}: {
  stage: string | null;
  current: number;
  total: number;
}) {
  const s = (stage || "").toLowerCase();
  const frac =
    s === "parsing" || s === "matching" || s.startsWith("done")
      ? s.startsWith("done")
        ? 1
        : 0.15
      : total > 0
        ? Math.min(1, current / total)
        : 0;
  return (
    <span className="block">
      <span className="mb-1 block">
        <StageLine stage={stage} current={current} total={total} />
      </span>
      <span className="block h-1 overflow-hidden rounded-full bg-muted">
        <span
          className="block h-full rounded-full bg-warn/80 transition-all duration-500"
          style={{ width: `${Math.max(6, Math.round(frac * 100))}%` }}
        />
      </span>
    </span>
  );
}
