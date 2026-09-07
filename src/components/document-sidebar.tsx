"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type Doc = {
  id: string;
  filename: string;
  status: string;
  pageCount: number | null;
  errorMessage: string | null;
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
    const res = await fetch("/api/documents");
    const data = await res.json();
    setDocs(data.documents || []);
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 2500);
    return () => clearInterval(id);
  }, [load, refreshKey]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Documents
      </div>
      <ul className="flex-1 space-y-0.5 overflow-auto px-2 pb-3">
        {docs.length === 0 && (
          <li className="px-2 py-8 text-center text-xs text-muted-foreground">
            Add a PDF to begin extraction.
          </li>
        )}
        {docs.map((d) => {
          const active = selectedId === d.id;
          const short = shortenName(d.filename);
          return (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => onSelect(active ? null : d.id, active ? null : d.filename)}
                className={cn(
                  "w-full rounded-md px-2 py-2 text-left hover:bg-muted",
                  active && "bg-accent text-accent-foreground",
                )}
                title={d.filename}
              >
                <div className="truncate text-[13px] font-medium leading-snug">{short}</div>
                <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <StatusLabel status={d.status} />
                  {d.pageCount != null && <span>· {d.pageCount} pages</span>}
                </div>
                {d.errorMessage && (
                  <p className="mt-1 line-clamp-2 text-[11px] text-destructive">
                    {d.errorMessage}
                  </p>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
        Click a document to filter facts from it.
      </p>
    </div>
  );
}

function shortenName(name: string): string {
  return name
    .replace(/\.pdf$/i, "")
    .replace(/^\d+-/, "")
    .replace(/-/g, " ");
}

function StatusLabel({ status }: { status: string }) {
  if (status === "ready") return <span className="text-ok">Ready</span>;
  if (status === "failed") return <span className="text-danger">Failed</span>;
  if (status === "processing" || status === "queued") {
    return <span className="text-warn capitalize">{status}</span>;
  }
  return <span className="capitalize">{status}</span>;
}
