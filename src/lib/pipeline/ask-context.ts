import {
  getAskRefuseMinHits,
  getAskRefuseMinScore,
} from "@/lib/config";
import { getChunk, type ChunkRow } from "@/lib/db/chunks";
import { getDocument } from "@/lib/db/documents";
import { getFact, type FactRow } from "@/lib/db/facts";
import type { AskEvidenceHit } from "@/lib/embeddings/hybrid-ask";
import type { AskCitation } from "@/lib/llm/schemas";

const PARENT_EXCERPT_CHARS = 480;

export type AskContextItem = {
  /** 1-based index for prompt / citation mapping */
  index: number;
  evidenceId: string;
  factId: string;
  documentId: string;
  documentName: string | null;
  page: number | null;
  quote: string;
  score: number;
  claim: string | null;
  entity: string | null;
  factType: string | null;
  unit: string | null;
  period: string | null;
  scope: string | null;
  rawValue: string | null;
  sectionTitle: string | null;
  /** Truncated parent chunk text when available */
  parentExcerpt: string | null;
};

export type AskContextPack = {
  question: string;
  items: AskContextItem[];
  bestScore: number;
};

export type AskRefuseResult = {
  refuse: true;
  reason: string;
  bestScore: number;
  hitCount: number;
};

export type AskGateOk = {
  refuse: false;
  pack: AskContextPack;
};

export type AskGateResult = AskRefuseResult | AskGateOk;

export type AskContextDeps = {
  getFact?: (id: string) => FactRow | null;
  getDocumentName?: (documentId: string) => string | null;
  getChunk?: (id: string) => ChunkRow | null;
};

function truncate(text: string, max = PARENT_EXCERPT_CHARS): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/**
 * Hits that clear the refuse score floor (A3).
 * A2 already filtered by ASK_RERANK_MIN_SCORE; refuse can be stricter.
 */
export function filterHitsForRefuseGate(
  hits: AskEvidenceHit[],
  minScore = getAskRefuseMinScore(),
): AskEvidenceHit[] {
  return hits.filter((h) => h.score >= minScore);
}

/**
 * Pure refuse decision (A3) before packing context.
 */
export function decideAskRefuse(
  hits: AskEvidenceHit[],
  opts?: { minScore?: number; minHits?: number },
): AskRefuseResult | null {
  const minScore = opts?.minScore ?? getAskRefuseMinScore();
  const minHits = opts?.minHits ?? getAskRefuseMinHits();
  const bestScore = hits.reduce((m, h) => Math.max(m, h.score), 0);
  const eligible = filterHitsForRefuseGate(hits, minScore);

  if (hits.length === 0) {
    return {
      refuse: true,
      reason: "No evidence retrieved for this question.",
      bestScore: 0,
      hitCount: 0,
    };
  }
  if (eligible.length === 0) {
    return {
      refuse: true,
      reason: `Retrieved evidence scored below the confidence floor (${minScore}).`,
      bestScore,
      hitCount: 0,
    };
  }
  if (eligible.length < minHits) {
    return {
      refuse: true,
      reason: `Only ${eligible.length} evidence hit(s) cleared the confidence floor; need at least ${minHits}.`,
      bestScore,
      hitCount: eligible.length,
    };
  }
  return null;
}

function defaultDocumentName(documentId: string): string | null {
  const doc = getDocument(documentId);
  return doc?.original_filename ?? null;
}

function resolveParentMeta(
  fact: FactRow | null,
  getChunkFn: (id: string) => ChunkRow | null,
): { sectionTitle: string | null; parentExcerpt: string | null } {
  if (!fact?.chunk_id) {
    return { sectionTitle: null, parentExcerpt: null };
  }
  const child = getChunkFn(fact.chunk_id);
  if (!child) return { sectionTitle: null, parentExcerpt: null };

  let parentExcerpt: string | null = null;
  if (child.parent_id) {
    const parent = getChunkFn(child.parent_id);
    if (parent?.text?.trim()) {
      parentExcerpt = truncate(parent.text);
    }
  }

  return {
    sectionTitle: child.section_title ?? null,
    parentExcerpt,
  };
}

/**
 * Attach fact metadata (+ optional parent/section) to reranked evidence (A3).
 */
export function buildAskContextPack(
  question: string,
  hits: AskEvidenceHit[],
  deps: AskContextDeps = {},
): AskContextPack {
  const getFactFn = deps.getFact ?? getFact;
  const getDocName = deps.getDocumentName ?? defaultDocumentName;
  const getChunkFn = deps.getChunk ?? getChunk;

  const eligible = filterHitsForRefuseGate(hits);
  const bestScore = eligible.reduce((m, h) => Math.max(m, h.score), 0);

  const items: AskContextItem[] = eligible.map((hit, i) => {
    const fact = getFactFn(hit.factId);
    const parentMeta = resolveParentMeta(fact, getChunkFn);
    return {
      index: i + 1,
      evidenceId: hit.evidenceId,
      factId: hit.factId,
      documentId: hit.documentId,
      documentName: getDocName(hit.documentId),
      page: hit.page,
      quote: hit.quote,
      score: hit.score,
      claim: fact?.claim ?? null,
      entity: fact?.entity ?? null,
      factType: fact?.fact_type ?? null,
      unit: fact?.unit ?? null,
      period: fact?.period ?? null,
      scope: fact?.scope ?? null,
      rawValue: fact?.raw_value ?? null,
      sectionTitle: parentMeta.sectionTitle,
      parentExcerpt: parentMeta.parentExcerpt,
    };
  });

  return {
    question: (question ?? "").replace(/\s+/g, " ").trim(),
    items,
    bestScore,
  };
}

/**
 * Refuse gate + context pack (A3 entry for the Ask orchestrator).
 */
export function gateAskContext(
  question: string,
  hits: AskEvidenceHit[],
  deps: AskContextDeps = {},
  refuseOpts?: { minScore?: number; minHits?: number },
): AskGateResult {
  const refused = decideAskRefuse(hits, refuseOpts);
  if (refused) return refused;
  return {
    refuse: false,
    pack: buildAskContextPack(question, hits, deps),
  };
}

/** Citation rows derived from a pack (API / generate). */
export function citationsFromPack(pack: AskContextPack): AskCitation[] {
  return pack.items.map((item) => ({
    factId: item.factId,
    documentId: item.documentId,
    page: item.page,
    quote: item.quote,
    evidenceId: item.evidenceId,
  }));
}

/** Compact prompt block for grounded generate (A4). */
export function formatAskContextForPrompt(pack: AskContextPack): string {
  const blocks = pack.items.map((item) => {
    const meta = [
      item.entity && `entity=${item.entity}`,
      item.factType && `type=${item.factType}`,
      item.period && `period=${item.period}`,
      item.unit && `unit=${item.unit}`,
      item.scope && `scope=${item.scope}`,
      item.rawValue != null && `value=${item.rawValue}`,
      item.sectionTitle && `section=${item.sectionTitle}`,
      item.documentName && `doc=${item.documentName}`,
      item.page != null && `page=${item.page}`,
      `score=${item.score.toFixed(3)}`,
    ]
      .filter(Boolean)
      .join(" | ");

    const lines = [
      `[${item.index}] ${meta}`,
      item.claim ? `claim: ${item.claim}` : null,
      `quote: ${item.quote}`,
      item.parentExcerpt ? `parent: ${item.parentExcerpt}` : null,
      `ids: factId=${item.factId}; evidenceId=${item.evidenceId}; documentId=${item.documentId}`,
    ].filter(Boolean);
    return lines.join("\n");
  });

  return [
    `Question: ${pack.question}`,
    "",
    "Evidence pack (answer ONLY from these; cite by index):",
    ...blocks.flatMap((b, i) => (i === 0 ? [b] : ["", b])),
  ].join("\n");
}
