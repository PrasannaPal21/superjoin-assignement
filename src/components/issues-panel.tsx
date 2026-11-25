"use client";

import { useCallback, useEffect, useState } from "react";
import { shortDocName, timeAgo } from "@/lib/format";
import {
  Check,
  Loader2,
  NotebookText,
  RefreshCw,
  TriangleAlert,
  Wrench,
  X,
} from "lucide-react";

type Failure = {
  id: string;
  documentId: string | null;
  documentName: string | null;
  stage: string;
  summary: string;
  detail: string | null;
  suggestion: string | null;
  createdAt: string;
};

type ReviewItem = {
  id: string;
  rationale: string | null;
  confidence: number;
  a: { claim: string; documentName: string | null; rawValue: string | null; unit: string | null };
  b: { claim: string; documentName: string | null; rawValue: string | null; unit: string | null };
};

export function IssuesPanel({ refreshKey = 0 }: { refreshKey?: number }) {
  const [failures, setFailures] = useState<Failure[]>([]);
  const [reviewQueue, setReviewQueue] = useState<ReviewItem[]>([]);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewHint, setReviewHint] = useState<string | null>(null);
  const [reprocessBusy, setReprocessBusy] = useState<string | null>(null);
  const [reprocessHint, setReprocessHint] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [f, rel] = await Promise.all([
        fetch("/api/failures").then((r) => r.json()),
        fetch("/api/relations?reviewStatus=needs_review").then((r) => r.json()),
      ]);
      setFailures(f.failures || []);
      setReviewQueue(rel.relations || []);
    } catch {
      /* ignore */
    }
  }, []);

  const extractFailures = failures.filter((f) => f.stage === "extract");
  const extractFailureIds = extractFailures.map((f) => f.id);
  const extractDocIds = Array.from(
    new Set(
      extractFailures
        .map((f) => f.documentId)
        .filter((id): id is string => Boolean(id)),
    ),
  );

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  async function reviewRelation(id: string, decision: "confirmed" | "rejected") {
    setReviewingId(id);
    setReviewHint(null);
    try {
      const res = await fetch(`/api/relations/${id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          typeof data.error === "string" ? data.error : "Review failed",
        );
      }
      await load();
      window.dispatchEvent(new Event("fkl-refresh"));
    } catch (err) {
      setReviewHint(err instanceof Error ? err.message : "Review failed");
    } finally {
      setReviewingId(null);
    }
  }

  async function retryFailedPages(opts: {
    failureIds?: string[];
    documentIds?: string[];
    busyKey: string;
  }) {
    const { failureIds, documentIds, busyKey } = opts;
    if (
      ((!failureIds || failureIds.length === 0) &&
        (!documentIds || documentIds.length === 0)) ||
      reprocessBusy
    ) {
      return;
    }
    setReprocessBusy(busyKey);
    setReprocessHint(null);
    try {
      const res = await fetch("/api/reprocess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "failed_pages",
          failureIds,
          documentIds,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Retry failed",
        );
      }
      setReprocessHint(
        typeof data.message === "string"
          ? data.message
          : "Retried failed pages only (other facts kept).",
      );
      window.dispatchEvent(new Event("fkl-refresh"));
      await load();
    } catch (err) {
      setReprocessHint(err instanceof Error ? err.message : "Retry failed");
    } finally {
      setReprocessBusy(null);
    }
  }

  return (
    <div className="mx-auto grid max-w-4xl gap-4 pt-1 lg:grid-cols-2">
      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-2.5">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <TriangleAlert className="size-4 text-warn" />
            HITL review queue
          </h2>
          <span className="text-[11px] tabular text-muted-foreground">
            {reviewQueue.length} pending
          </span>
        </div>
        {reviewHint && (
          <p className="border-b border-danger/20 bg-danger-soft px-4 py-2 text-xs text-danger">
            {reviewHint}
          </p>
        )}
        <ul className="max-h-[520px] divide-y divide-border/70 overflow-auto">
          {reviewQueue.length === 0 && (
            <li className="px-4 py-12 text-center">
              <Check className="mx-auto mb-2 size-6 text-ok/60" />
              <p className="text-sm font-medium text-foreground">Queue empty</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Low-confidence conflicts land here for confirm/reject.
              </p>
            </li>
          )}
          {reviewQueue.map((r) => (
            <li key={r.id} className="px-4 py-3">
              <p className="text-sm font-medium leading-snug text-foreground">
                {r.rationale || "Low-confidence conflict"}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {shortDocName(r.a.documentName)} ({[r.a.rawValue, r.a.unit].filter(Boolean).join(" ") || "—"})
                {" vs "}
                {shortDocName(r.b.documentName)} ({[r.b.rawValue, r.b.unit].filter(Boolean).join(" ") || "—"})
                {" · "}
                {(r.confidence * 100).toFixed(0)}%
              </p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={reviewingId === r.id}
                  onClick={() => void reviewRelation(r.id, "confirmed")}
                  className="inline-flex items-center gap-1 rounded-full bg-ok px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
                >
                  <Check className="size-3" strokeWidth={3} />
                  Confirm
                </button>
                <button
                  type="button"
                  disabled={reviewingId === r.id}
                  onClick={() => void reviewRelation(r.id, "rejected")}
                  className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  <X className="size-3" />
                  Reject
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/30 px-4 py-2.5">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <NotebookText className="size-4 text-accent-foreground" />
            Failure journal
          </h2>
          <div className="flex items-center gap-2">
            <span className="text-[11px] tabular text-muted-foreground">
              {failures.length} entr{failures.length === 1 ? "y" : "ies"}
            </span>
            {extractFailureIds.length > 0 && (
              <button
                type="button"
                disabled={Boolean(reprocessBusy)}
                onClick={() =>
                  void retryFailedPages({
                    failureIds: extractFailureIds,
                    busyKey: "all-failed",
                  })
                }
                className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground disabled:opacity-50"
                title={`Retry ${extractFailureIds.length} failed page chunk(s) across ${extractDocIds.length} doc(s) — keeps other facts`}
              >
                {reprocessBusy === "all-failed" ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <RefreshCw className="size-3" />
                )}
                Retry {extractFailureIds.length} failed page
                {extractFailureIds.length === 1 ? "" : "s"}
              </button>
            )}
          </div>
        </div>
        {reprocessHint && (
          <p className="border-b border-border bg-muted/20 px-4 py-2 text-xs text-muted-foreground">
            {reprocessHint}
          </p>
        )}

        <ul className="max-h-[520px] divide-y divide-border/70 overflow-auto">
          {failures.length === 0 && (
            <li className="px-4 py-12 text-center">
              <Check className="mx-auto mb-2 size-6 text-ok/60" />
              <p className="text-sm font-medium text-foreground">No failures recorded</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Processing issues will be logged here with suggested fixes.
              </p>
            </li>
          )}
          {failures.map((f) => (
            <li key={f.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-warn-soft px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-warn">
                  {f.stage}
                </span>
                <span className="text-[11px] text-muted-foreground">{timeAgo(f.createdAt)}</span>
                {f.documentName && (
                  <span className="text-[11px] text-muted-foreground">
                    · {shortDocName(f.documentName)}
                  </span>
                )}
              </div>
              <p className="mt-1.5 text-sm font-medium leading-snug text-foreground">{f.summary}</p>
              {f.detail && (
                <p className="mt-1 break-words text-xs leading-relaxed text-muted-foreground">
                  {f.detail.length > 220 ? `${f.detail.slice(0, 220)}…` : f.detail}
                </p>
              )}
              {f.suggestion && (
                <p className="mt-1.5 flex items-start gap-1.5 text-xs text-accent-foreground">
                  <Wrench className="mt-0.5 size-3 shrink-0" />
                  {f.suggestion}
                </p>
              )}
              {f.stage === "extract" && (
                <div className="mt-2.5">
                  <button
                    type="button"
                    disabled={Boolean(reprocessBusy)}
                    onClick={() =>
                      void retryFailedPages({
                        failureIds: [f.id],
                        busyKey: `one:${f.id}`,
                      })
                    }
                    className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold text-foreground hover:bg-muted disabled:opacity-50"
                    title="Re-extract only this failed page/chunk; keeps the rest of the PDF facts"
                  >
                    {reprocessBusy === `one:${f.id}` ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <RefreshCw className="size-3" />
                    )}
                    Retry this page
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
