"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
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

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  refused?: boolean;
  reason?: string | null;
  confidence?: number | null;
  citations?: Citation[];
  stats?: AskResponse["stats"];
  error?: boolean;
};

const EXAMPLES = [
  "What revenue or income figures appear across these documents?",
  "What EBITDA or operating profit amounts are reported?",
  "Are there fleet size or capacity figures?",
];

export function AskPanel({ refreshKey = 0 }: { refreshKey?: number }) {
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const idPrefix = useId();
  const msgSeq = useRef(0);

  // refreshKey reserved so shell remounts/clears feel consistent with other tabs
  void refreshKey;

  useEffect(() => {
    const el = threadRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  const nextId = useCallback(() => {
    msgSeq.current += 1;
    return `${idPrefix}-${msgSeq.current}`;
  }, [idPrefix]);

  const ask = useCallback(
    async (q: string) => {
      const trimmed = q.trim();
      if (!trimmed || busy) return;

      setQuestion("");
      setBusy(true);
      setMessages((prev) => [
        ...prev,
        { id: nextId(), role: "user", text: trimmed },
      ]);

      try {
        const res = await fetch("/api/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: trimmed }),
        });
        const data = (await res.json()) as AskResponse;
        if (!res.ok) {
          setMessages((prev) => [
            ...prev,
            {
              id: nextId(),
              role: "assistant",
              text: data.error || `Ask failed (${res.status})`,
              error: true,
            },
          ]);
          return;
        }
        setMessages((prev) => [
          ...prev,
          {
            id: nextId(),
            role: "assistant",
            text: data.refused
              ? data.reason || "Not enough grounded evidence to answer."
              : data.answer,
            refused: data.refused,
            reason: data.reason,
            confidence: data.confidence,
            citations: data.citations,
            stats: data.stats,
          },
        ]);
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          {
            id: nextId(),
            role: "assistant",
            text: err instanceof Error ? err.message : "Ask request failed",
            error: true,
          },
        ]);
      } finally {
        setBusy(false);
        requestAnimationFrame(() => inputRef.current?.focus());
      }
    },
    [busy, nextId],
  );

  return (
    <div className="mx-auto flex h-[min(720px,calc(100vh-11rem))] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex shrink-0 items-start gap-3 border-b border-border px-4 py-3">
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

      <div
        ref={threadRef}
        className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4"
      >
        {messages.length === 0 && !busy && (
          <div className="flex h-full min-h-[200px] flex-col items-center justify-center px-4 text-center">
            <CircleHelp className="mb-2 size-7 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              Ask about figures, periods, or KPIs across uploaded documents.
            </p>
            <div className="mt-4 flex max-w-lg flex-wrap justify-center gap-1.5">
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
          </div>
        )}

        {messages.map((m) => (
          <div
            key={m.id}
            className={cn(
              "flex",
              m.role === "user" ? "justify-end" : "justify-start",
            )}
          >
            {m.role === "user" ? (
              <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-3.5 py-2.5 text-sm leading-relaxed text-primary-foreground">
                {m.text}
              </div>
            ) : (
              <div className="max-w-[92%] space-y-3">
                {m.error ? (
                  <div className="flex items-start gap-2 rounded-2xl rounded-bl-md border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
                    <ShieldAlert className="mt-0.5 size-4 shrink-0" />
                    <span>{m.text}</span>
                  </div>
                ) : m.refused ? (
                  <div className="rounded-2xl rounded-bl-md border border-warn/30 bg-warn-soft px-3.5 py-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-warn">
                      Refused
                    </p>
                    <p className="mt-1 text-sm text-foreground">{m.text}</p>
                  </div>
                ) : (
                  <div className="rounded-2xl rounded-bl-md border border-border bg-muted/30 px-3.5 py-2.5">
                    {m.confidence != null && (
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Answer · {(m.confidence * 100).toFixed(0)}%
                      </p>
                    )}
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                      {m.text}
                    </p>
                  </div>
                )}

                {!m.error && !m.refused && m.citations && m.citations.length > 0 && (
                  <div className="space-y-2 pl-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Citations ({m.citations.length})
                    </p>
                    {m.citations.map((c, i) => (
                      <div
                        key={`${m.id}-${c.evidenceId ?? c.factId}-${i}`}
                        className="rounded-lg border border-border bg-card px-3 py-2"
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
                        <p className="mt-1.5 flex gap-2 text-sm leading-relaxed">
                          <Quote className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                          <span className="italic text-muted-foreground">
                            {c.quote}
                          </span>
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {m.stats && (
                  <p className="pl-1 text-[11px] tabular text-muted-foreground">
                    retrieved {m.stats.retrieved} · reranked {m.stats.reranked}{" "}
                    · packed {m.stats.packed}
                    {m.stats.bestScore > 0 &&
                      ` · best ${(m.stats.bestScore * 100).toFixed(0)}%`}
                  </p>
                )}
              </div>
            )}
          </div>
        ))}

        {busy && (
          <div className="flex justify-start">
            <div className="inline-flex items-center gap-2 rounded-2xl rounded-bl-md border border-border bg-muted/30 px-3.5 py-2.5 text-sm text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              Retrieving…
            </div>
          </div>
        )}
      </div>

      <form
        className="shrink-0 border-t border-border bg-muted/20 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(question);
        }}
      >
        {messages.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                disabled={busy}
                onClick={() => void ask(ex)}
                className="rounded-md border border-border bg-card px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
              >
                {ex.length > 40 ? `${ex.slice(0, 38)}…` : ex}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2">
          <label className="sr-only" htmlFor="ask-question">
            Message
          </label>
          <textarea
            ref={inputRef}
            id="ask-question"
            rows={2}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void ask(question);
              }
            }}
            placeholder="Ask a follow-up…"
            className="min-h-[44px] w-full resize-none rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-foreground shadow-sm outline-none placeholder:text-muted-foreground/70 focus:border-primary/40 focus:ring-2 focus:ring-primary/15"
            disabled={busy}
          />
          <button
            type="submit"
            disabled={busy || !question.trim()}
            className={cn(
              "inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-opacity",
              (busy || !question.trim()) && "opacity-50",
            )}
            aria-label="Send"
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
