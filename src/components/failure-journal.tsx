"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

type Failure = {
  id: string;
  documentId: string | null;
  stage: string;
  summary: string;
  detail: string | null;
  suggestion: string | null;
  createdAt: string;
};

export function FailureJournal({ refreshKey = 0 }: { refreshKey?: number }) {
  const [failures, setFailures] = useState<Failure[]>([]);

  useEffect(() => {
    void fetch("/api/failures")
      .then((r) => r.json())
      .then((data) => setFailures(data.failures || []));
  }, [refreshKey]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Operational log for parse gaps, model errors, and matching failures.
      </p>
      <ScrollArea className="h-[min(70vh,720px)]">
        <ul className="space-y-2 pr-3">
          {failures.length === 0 && (
            <li className="rounded-xl border border-border bg-card p-8 text-sm text-muted-foreground">
              No incidents recorded.
            </li>
          )}
          {failures.map((f) => (
            <li
              key={f.id}
              className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="border-warn/30 bg-warn/10 text-warn">
                  {f.stage}
                </Badge>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {f.createdAt}
                </span>
              </div>
              <p className="mt-2 text-sm font-medium">{f.summary}</p>
              {f.detail && <p className="mt-1 text-sm text-muted-foreground">{f.detail}</p>}
              {f.suggestion && (
                <p className="mt-1 text-sm text-primary">Action: {f.suggestion}</p>
              )}
            </li>
          ))}
        </ul>
      </ScrollArea>
    </div>
  );
}
