"use client";

import { useCallback, useState } from "react";
import { cn } from "@/lib/utils";
import { shortDocName } from "@/lib/format";
import {
  CircleHelp,
  Loader2,
  MessageCircleQuestion,
  Quote,
  Send,
  ShieldAlert,
} from "lucide-react";

type Citation = {
  factId: string;
  documentId: string;
  documentName?: string | null;
  page?: number | null;
  quote: string;
  evidenceId?: string;
};

type AskResponse = {
  refused: boolean;
  answer: string;
  citations: Citation[];
  reason?: string | null;
  confidence?: number | null;
  stats?: {
    retrieved: number;
    reranked: number;
    packed: number;
    bestScore: number;
    refusedAt: string | null;
  };
  error?: string;
};

const EXAMPLES = [
  "What revenue or income figures appear across these documents?",
  "What EBITDA or operating profit amounts are reported?",
  "Are there fleet size or capacity figures?",
];

export function AskPanel({ refreshKey = 0 }: { refreshKey?: number }) {
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AskResponse | null>(null);

  // refreshKey reserved so shell remounts/clears feel consistent with other tabs
  void refreshKey;

  const ask = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    setQuestion(trimmed);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed }),
      });
      const data = (await res.json()) as AskResponse;
      if (!res.ok) {
        setError(data.error || `Ask failed (${res.status})`);
        return;
      }
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ask request failed");
    } finally {
      setBusy(false);
    }
  }, [busy]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <MessageCircleQuestion className="size-4" />
        </span>
        <div>
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            Ask
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Grounded answers from retrieved evidence only — every claim cites a
            page quote, or the system refuses.
          </p>
        </div>
      </div>

      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(question);
        }}
      >
        <label className="sr-only" htmlFor="ask-question">
          Question
        </label>
        <textarea
          id="ask-question"
          rows={3}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask about figures, periods, or KPIs across uploaded documents…"
          className="w-full resize-y rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-foreground shadow-sm outline-none placeholder:text-muted-foreground/70 focus:border-primary/40 focus:ring-2 focus:ring-primary/15"
          disabled={busy}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                disabled={busy}
                onClick={() => void ask(ex)}
                className="rounded-md border border-border bg-muted/40 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
              >
                {ex.length > 52 ? `${ex.slice(0, 50)}…` : ex}
              </button>
            ))}
          </div>
          <button
            type="submit"
            disabled={busy || !question.trim()}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity",
              (busy || !question.trim()) && "opacity-50",
            )}
          >
            {busy ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Send className="size-3.5" />
            )}
            {busy ? "Retrieving…" : "Ask"}
          </button>
        </div>
      </form>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2.5 text-sm text-danger">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!result && !error && !busy && (
        <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center">
          <CircleHelp className="mx-auto mb-2 size-7 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            Submit a question once documents are Ready and indexed.
          </p>
        </div>
      )}

      {result && (
        <div className="space-y-4">
          {result.refused ? (
            <div className="rounded-lg border border-warn/30 bg-warn-soft px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-warn">
                Refused
              </p>
              <p className="mt-1 text-sm text-foreground">
                {result.reason || "Not enough grounded evidence to answer."}
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-card px-4 py-3 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Answer
                {result.confidence != null && (
                  <span className="ml-2 font-normal normal-case tabular text-muted-foreground/80">
                    confidence {(result.confidence * 100).toFixed(0)}%
                  </span>
                )}
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                {result.answer}
              </p>
            </div>
          )}

          {!result.refused && result.citations?.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Citations ({result.citations.length})
              </h3>
              <ul className="space-y-2">
                {result.citations.map((c, i) => (
                  <li
                    key={`${c.evidenceId ?? c.factId}-${i}`}
                    className="rounded-lg border border-border bg-card px-3 py-2.5"
                  >
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                      <span className="font-medium text-foreground">
                        [{i + 1}]
                      </span>
                      <span>
                        {shortDocName(c.documentName) ||
                          shortDocName(c.documentId)}
                      </span>
                      {c.page != null && <span>p.{c.page}</span>}
                    </div>
                    <p className="mt-1.5 flex gap-2 text-sm leading-relaxed text-foreground">
                      <Quote className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                      <span className="italic text-muted-foreground">
                        {c.quote}
                      </span>
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.stats && (
            <p className="text-[11px] tabular text-muted-foreground">
              retrieved {result.stats.retrieved} · reranked{" "}
              {result.stats.reranked} · packed {result.stats.packed}
              {result.stats.bestScore > 0 &&
                ` · best ${(result.stats.bestScore * 100).toFixed(0)}%`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
