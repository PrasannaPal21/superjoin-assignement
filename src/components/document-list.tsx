"use client";

import { useCallback, useEffect, useState } from "react";
import Loader from "@/components/kokonutui/loader";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

type Doc = {
  id: string;
  filename: string;
  byteSize: number;
  pageCount: number | null;
  status: string;
  contentHash: string | null;
  errorMessage: string | null;
  createdAt: string;
};

type Ops = {
  jobsQueued: number;
  jobsRunning: number;
  jobsFailed: number;
  factTypes: string[];
};

export function DocumentList({ refreshKey = 0 }: { refreshKey?: number }) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [ops, setOps] = useState<Ops | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch("/api/documents");
    const data = await res.json();
    setDocs(data.documents || []);
    setOps(data.ops || null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 2500);
    return () => clearInterval(id);
  }, [load, refreshKey]);

  const busy = docs.some((d) => d.status === "queued" || d.status === "processing");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Queue depth and per-document pipeline status.
        </p>
        {ops && (
          <div className="flex gap-2 font-mono text-xs text-muted-foreground">
            <span>queued {ops.jobsQueued}</span>
            <span>running {ops.jobsRunning}</span>
            <span>failed {ops.jobsFailed}</span>
          </div>
        )}
      </div>

      {loading && (
        <Loader size="sm" title="Loading documents" subtitle="Reading job queue" />
      )}

      {!loading && docs.length === 0 && (
        <div className="rounded-xl border border-border bg-card p-8 text-sm text-muted-foreground">
          No documents yet. Ingest a PDF to start the pipeline.
        </div>
      )}

      <ScrollArea className="h-[min(70vh,720px)]">
        <ul className="space-y-2 pr-3">
          {docs.map((d) => (
            <li
              key={d.id}
              className="flex flex-col gap-2 rounded-xl border border-border bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{d.filename}</p>
                <p className="font-mono text-xs text-muted-foreground">
                  {Math.round(d.byteSize / 1024)} KB
                  {d.pageCount != null ? ` · ${d.pageCount} pages` : ""}
                  {d.contentHash ? ` · ${d.contentHash.slice(0, 10)}` : ""}
                </p>
                {d.errorMessage && (
                  <p className="mt-1 text-xs text-destructive">{d.errorMessage}</p>
                )}
              </div>
              <StatusBadge status={d.status} />
            </li>
          ))}
        </ul>
      </ScrollArea>

      {busy && (
        <Loader
          size="sm"
          title="Pipeline active"
          subtitle="Extracting facts and matching across documents"
        />
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variant =
    status === "ready"
      ? "bg-ok/15 text-ok border-ok/20"
      : status === "failed"
        ? "bg-danger/15 text-danger border-danger/20"
        : "bg-warn/15 text-warn border-warn/20";
  return (
    <Badge variant="outline" className={`uppercase ${variant}`}>
      {status}
    </Badge>
  );
}
