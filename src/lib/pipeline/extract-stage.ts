import { randomUUID } from "crypto";
import { getDb } from "@/lib/db/client";
import { ensureDb } from "@/lib/db";
import { insertEvidence, insertFact } from "@/lib/db/facts";
import { extractFactsFromChunk } from "@/lib/llm/extract";
import type { TextChunk } from "@/lib/pdf/chunk";

function normalizeEntity(entity?: string | null): string {
  return (entity || "")
    .toLowerCase()
    .replace(/\b(limited|ltd\.?|inc\.?|pvt\.?|private|company)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Stable family key for cross-document candidates.
 * Period/scope are intentionally omitted so FY23 vs FY24 (etc.) can still pair;
 * classification decides corroborates / contradicts / reconciled.
 */
export function buildMatchKey(fact: {
  entity?: string | null;
  factType?: string | null;
  unit?: string | null;
  claim?: string | null;
}): string {
  const parts = [
    normalizeEntity(fact.entity),
    (fact.factType || "").toLowerCase().trim(),
    (fact.unit || "").toLowerCase().trim(),
  ];
  return parts.filter(Boolean).join("|") || (fact.claim || "").toLowerCase().slice(0, 80);
}

export function persistChunk(
  documentId: string,
  chunk: TextChunk,
): string {
  ensureDb();
  const id = randomUUID();
  getDb()
    .prepare(
      `INSERT INTO chunks (id, document_id, page_start, page_end, text, token_estimate)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      documentId,
      chunk.pageStart,
      chunk.pageEnd,
      chunk.text,
      chunk.tokenEstimate,
    );
  return id;
}

export async function extractAndStoreChunkFacts(opts: {
  documentId: string;
  chunkId: string;
  chunk: TextChunk;
}): Promise<number> {
  const result = await extractFactsFromChunk(opts.chunk.text);
  let stored = 0;

  for (const fact of result.facts) {
    const factId = randomUUID();
    insertFact({
      id: factId,
      document_id: opts.documentId,
      chunk_id: opts.chunkId,
      claim: fact.claim,
      raw_value: fact.rawValue ?? null,
      numeric_value: fact.numericValue ?? null,
      unit: fact.unit ?? null,
      period: fact.period ?? null,
      scope: fact.scope ?? null,
      entity: fact.entity ?? null,
      fact_type: fact.factType || "other",
      confidence: fact.confidence ?? 0.5,
      status: "active",
      match_key: buildMatchKey(fact),
    });

    insertEvidence({
      id: randomUUID(),
      fact_id: factId,
      document_id: opts.documentId,
      page: fact.evidencePage ?? opts.chunk.pageStart,
      quote: fact.evidenceQuote.slice(0, 2000),
    });
    stored += 1;
  }

  return stored;
}
