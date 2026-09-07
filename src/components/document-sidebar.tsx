"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type Doc = {
  id: string;
  filename: string;
  status: string;
  pageCount: number | null;
  byteSize: number;
  errorMessage: string | null;
};

export function DocumentSidebar({
  refreshKey = 0,
  selectedId,
  onSelect,
}: {
  refreshKey?: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
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
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Documents
        </span>
        {selectedId && (
          <button
            type="button"
            className="text-[11px] text-muted-foreground hover:text-foreground"
            onClick={() => onSelect(null)}
          >
            Clear filter
          </button>
        )}
      </div>
      <ul className="flex-1 overflow-auto px-2 pb-3">
        {docs.length === 0 && (
          <li className="px-2 py-6 text-center text-xs text-muted-foreground">
            No PDFs yet
          </li>
        )}
        {docs.map((d) => {
          const active = selectedId === d.id;
          return (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => onSelect(d.id)}
                className={cn(
                  "mb-1 w-full rounded-md px-2 py-2 text-left text-sm hover:bg-muted",
                  active && "bg-muted",
                )}
              >
                <div className="truncate font-medium">{d.filename}</div>
                <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                  <StatusDot status={d.status} />
                  <span className="uppercase">{d.status}</span>
                  {d.pageCount != null && <span>· {d.pageCount}p</span>}
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
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === "ready"
      ? "bg-ok"
      : status === "failed"
        ? "bg-danger"
        : "bg-warn";
  return <span className={cn("inline-block h-1.5 w-1.5 rounded-full", color)} />;
}
