/**
 * Golden fixtures for Ask path (stage A7).
 * Offline: no MiniLM download / no live Groq — mocked retrieve, CE, chatJson.
 *
 * Cases: refuse (empty / weak) · answer+cite · harden remap.
 */

import type { AskEvidenceHit } from "@/lib/embeddings/hybrid-ask";
import type { FactRow } from "@/lib/db/facts";
import { askQuestion, type AskQuestionDeps } from "@/lib/pipeline/ask";
import {
  decideAskRefuse,
  type AskContextPack,
} from "@/lib/pipeline/ask-context";
import { hardenAskGeneration } from "@/lib/pipeline/ask-generate";

export type AskGoldenKind = "refuse" | "answer";

export type AskGateGolden = {
  id: string;
  kind: "refuse" | "pass";
  hits: AskEvidenceHit[];
  minScore?: number;
  minHits?: number;
  note: string;
};

export type AskHardenGolden = {
  id: string;
  kind: AskGoldenKind;
  pack: AskContextPack;
  llmJson: string;
  /** Expected factId on first citation when kind=answer */
  expectFactId?: string;
  note: string;
};

export type AskOrchGolden = {
  id: string;
  kind: AskGoldenKind;
  question: string;
  deps: AskQuestionDeps;
  expectFactId?: string;
  note: string;
};

export function askHit(
  id: string,
  score: number,
  quote: string,
): AskEvidenceHit {
  return {
    evidenceId: `e-${id}`,
    factId: `f-${id}`,
    documentId: `d-${id}`,
    page: 12,
    quote,
    score,
    channels: ["sparse", "dense"],
  };
}

export function askFact(id: string, claim = `Claim ${id}`): FactRow {
  return {
    id: `f-${id}`,
    document_id: `d-${id}`,
    chunk_id: null,
    claim,
    raw_value: "8143",
    numeric_value: 8143,
    unit: "crore",
    period: "FY24",
    scope: "consolidated",
    entity: "Delhivery",
    fact_type: "revenue",
    confidence: 0.9,
    status: "active",
    match_key: "delhivery|revenue|crore",
    created_at: "",
  };
}

const revenuePack: AskContextPack = {
  question: "What was FY24 revenue?",
  bestScore: 0.91,
  items: [
    {
      index: 1,
      evidenceId: "e-rev",
      factId: "f-rev",
      documentId: "d-rev",
      documentName: "ar-fy24.pdf",
      page: 12,
      quote: "Revenue from operations 8143 crore",
      score: 0.91,
      claim: "Revenue from operations",
      entity: "Delhivery",
      factType: "revenue",
      unit: "crore",
      period: "FY24",
      scope: "consolidated",
      rawValue: "8143",
      sectionTitle: "Highlights",
      parentExcerpt: null,
    },
  ],
};

/** Refuse-gate goldens (A3) — fixed thresholds for offline stability. */
export const ASK_GATE_GOLDENS: readonly AskGateGolden[] = [
  {
    id: "gate-empty",
    kind: "refuse",
    hits: [],
    note: "No retrieval → refuse",
  },
  {
    id: "gate-weak",
    kind: "refuse",
    hits: [askHit("noise", 0.2, "Unrelated glossary text")],
    minScore: 0.4,
    minHits: 1,
    note: "Scores below refuse floor → refuse",
  },
  {
    id: "gate-pass",
    kind: "pass",
    hits: [askHit("rev", 0.85, "Revenue from operations 8143 crore")],
    minScore: 0.4,
    minHits: 1,
    note: "Strong hit clears refuse gate",
  },
] as const;

/** Harden / generate goldens (A4) — no live Groq. */
export const ASK_HARDEN_GOLDENS: readonly AskHardenGolden[] = [
  {
    id: "harden-cite",
    kind: "answer",
    pack: revenuePack,
    llmJson: JSON.stringify({
      refused: false,
      answer: "FY24 revenue was 8143 crore.",
      citationIndexes: [1],
      confidence: 0.9,
    }),
    expectFactId: "f-rev",
    note: "Valid indexes remap to pack citations",
  },
  {
    id: "harden-bad-index",
    kind: "refuse",
    pack: revenuePack,
    llmJson: JSON.stringify({
      refused: false,
      answer: "Made-up figure",
      citationIndexes: [99],
    }),
    note: "Invalid citation indexes → refuse",
  },
  {
    id: "harden-model-refuse",
    kind: "refuse",
    pack: revenuePack,
    llmJson: JSON.stringify({
      refused: true,
      reason: "Evidence does not answer the question.",
      citationIndexes: [],
    }),
    note: "Model refuse honored",
  },
] as const;

function orchDeps(opts: {
  hits: AskEvidenceHit[];
  ceScores: number[];
  llmJson?: string;
}): AskQuestionDeps {
  return {
    retrieve: async () => opts.hits,
    scoreCe: async () => opts.ceScores,
    getFact: (id) => {
      const key = id.replace(/^f-/, "");
      return askFact(key);
    },
    getDocumentName: () => "ar-fy24.pdf",
    getChunk: () => null,
    chatJson: async () =>
      opts.llmJson ??
      JSON.stringify({
        refused: false,
        answer: "FY24 revenue was 8143 crore.",
        citationIndexes: [1],
        confidence: 0.9,
      }),
  };
}

/** End-to-end orchestrator goldens with mocks (A5). */
export const ASK_ORCH_GOLDENS: readonly AskOrchGolden[] = [
  {
    id: "orch-refuse-weak",
    kind: "refuse",
    question: "What was FY24 revenue?",
    deps: orchDeps({
      hits: [askHit("noise", 0.5, "TOC entry")],
      ceScores: [0.15],
    }),
    note: "CE kills weak hit → gate refuse",
  },
  {
    id: "orch-answer-cite",
    kind: "answer",
    question: "What was FY24 revenue?",
    deps: orchDeps({
      hits: [
        askHit("fleet", 0.02, "Fleet size 12000"),
        askHit("rev", 0.03, "Revenue from operations 8143 crore"),
      ],
      ceScores: [0.2, 0.93],
    }),
    expectFactId: "f-rev",
    note: "Strong CE hit → generate with citation",
  },
] as const;

export type AskEvalRow = {
  id: string;
  ok: boolean;
  detail: string;
};

export function evalAskGateGoldens(
  cases: readonly AskGateGolden[] = ASK_GATE_GOLDENS,
): AskEvalRow[] {
  return cases.map((c) => {
    const refused = decideAskRefuse(c.hits, {
      minScore: c.minScore,
      minHits: c.minHits,
    });
    const isRefuse = Boolean(refused);
    const ok = c.kind === "refuse" ? isRefuse : !isRefuse;
    return {
      id: c.id,
      ok,
      detail: ok
        ? c.kind
        : `expected ${c.kind}, got ${isRefuse ? "refuse" : "pass"}`,
    };
  });
}

export function evalAskHardenGoldens(
  cases: readonly AskHardenGolden[] = ASK_HARDEN_GOLDENS,
): AskEvalRow[] {
  return cases.map((c) => {
    const out = hardenAskGeneration(c.pack, c.llmJson);
    if (c.kind === "refuse") {
      const ok = out.refused === true;
      return {
        id: c.id,
        ok,
        detail: ok ? "refuse" : `expected refuse, got answer`,
      };
    }
    const ok =
      !out.refused &&
      out.citations.length > 0 &&
      (!c.expectFactId || out.citations[0]?.factId === c.expectFactId);
    return {
      id: c.id,
      ok,
      detail: ok
        ? `cite ${out.citations[0]?.factId}`
        : `expected answer+cite ${c.expectFactId ?? ""}`,
    };
  });
}

export async function evalAskOrchGoldens(
  cases: readonly AskOrchGolden[] = ASK_ORCH_GOLDENS,
): Promise<AskEvalRow[]> {
  const rows: AskEvalRow[] = [];
  for (const c of cases) {
    const out = await askQuestion(c.question, {}, c.deps);
    if (c.kind === "refuse") {
      const ok = out.refused === true;
      rows.push({
        id: c.id,
        ok,
        detail: ok ? `refuse@${out.stats.refusedAt}` : "expected refuse",
      });
      continue;
    }
    const ok =
      !out.refused &&
      out.citations.length > 0 &&
      (!c.expectFactId || out.citations[0]?.factId === c.expectFactId);
    rows.push({
      id: c.id,
      ok,
      detail: ok
        ? `cite ${out.citations[0]?.factId}`
        : `expected answer+cite ${c.expectFactId ?? ""}`,
    });
  }
  return rows;
}

export function scoreAskEval(rows: AskEvalRow[]): {
  accuracy: number;
  total: number;
  correct: number;
} {
  const correct = rows.filter((r) => r.ok).length;
  const total = rows.length;
  return {
    accuracy: total === 0 ? 0 : correct / total,
    total,
    correct,
  };
}
