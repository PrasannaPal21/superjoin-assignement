"use client";

import { useCallback, useEffect, useState } from "react";
import { OrbitLoader } from "@/components/ui/orbit-loader";

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
    <section className="rounded-2xl border border-line bg-panel p-6 backdrop-blur">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-2xl text-ink">
            Documents
          </h2>
          <p className="text-sm text-muted">Live status from the processing queue.</p>
        </div>
        {ops && (
          <p className="font-mono text-xs text-muted">
            q:{ops.jobsQueued} run:{ops.jobsRunning} fail:{ops.jobsFailed}
          </p>
        )}
      </div>

      {loading && <OrbitLoader label="Loading documents…" />}
      {!loading && docs.length === 0 && (
        <p className="text-sm text-muted">No documents yet. Upload a PDF to start.</p>
      )}

      <ul className="space-y-3">
        {docs.map((d) => (
          <li
            key={d.id}
            className="flex flex-col gap-1 rounded-xl border border-line bg-white/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p className="font-medium text-ink">{d.filename}</p>
              <p className="font-mono text-xs text-muted">
                {Math.round(d.byteSize / 1024)} KB
                {d.pageCount != null ? ` · ${d.pageCount} pages` : ""}
                {d.contentHash ? ` · ${d.contentHash.slice(0, 10)}` : ""}
              </p>
              {d.errorMessage && (
                <p className="mt-1 text-xs text-danger">{d.errorMessage}</p>
              )}
            </div>
            <StatusPill status={d.status} />
          </li>
        ))}
      </ul>

      {busy && (
        <div className="mt-4">
          <OrbitLoader label="Processing in background…" />
        </div>
      )}
    </section>
  );
}

function StatusPill({ status }: { status: string }) {
  const color =
    status === "ready"
      ? "text-ok bg-ok/10"
      : status === "failed"
        ? "text-danger bg-danger/10"
        : "text-warn bg-warn/10";
  return (
    <span className={`w-fit rounded-md px-2 py-1 text-xs font-semibold uppercase ${color}`}>
      {status}
    </span>
  );
}
