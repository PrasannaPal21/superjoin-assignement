import { getEmbeddingModel } from "@/lib/config";
import {
  getEvidenceEmbedding,
  getFactEmbedding,
  upsertEvidenceEmbedding,
  upsertFactEmbedding,
} from "@/lib/db/embeddings";
import {
  listEvidenceForDocument,
  listFacts,
  type EvidenceRow,
  type FactRow,
} from "@/lib/db/facts";
import { embedTexts } from "@/lib/embeddings/client";
import {
  buildEvidenceIndexText,
  buildFactCard,
} from "@/lib/embeddings/index-text";

export type IndexEmbeddingsResult = {
  factsIndexed: number;
  factsSkipped: number;
  evidenceIndexed: number;
  evidenceSkipped: number;
  model: string;
  dimensions: number;
};

export type IndexEmbeddingsOptions = {
  /** Re-embed even when the stored model matches. */
  force?: boolean;
  onProgress?: (label: string, current: number, total: number) => void;
};

/** True when there is no row, or the stored model differs from the active one. */
export function needsEmbedding(
  existing: { model: string } | null | undefined,
  activeModel: string,
  force = false,
): boolean {
  if (force) return true;
  if (!existing) return true;
  return existing.model !== activeModel;
}

function safeIndexText(text: string, fallback: string): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned) return cleaned;
  return fallback.replace(/\s+/g, " ").trim() || "unknown";
}

/**
 * Embed facts + evidence for a document after extract.
 * Skips rows already indexed with the current embedding model (unless `force`).
 */
export async function indexDocumentEmbeddings(
  documentId: string,
  opts: IndexEmbeddingsOptions = {},
): Promise<IndexEmbeddingsResult> {
  const activeModel = getEmbeddingModel();
  const facts = listFacts(documentId);
  const evidence = listEvidenceForDocument(documentId);

  const factsToEmbed: FactRow[] = [];
  let factsSkipped = 0;
  for (const fact of facts) {
    const existing = getFactEmbedding(fact.id);
    if (needsEmbedding(existing, activeModel, opts.force)) {
      factsToEmbed.push(fact);
    } else {
      factsSkipped += 1;
    }
  }

  const evidenceToEmbed: EvidenceRow[] = [];
  let evidenceSkipped = 0;
  for (const row of evidence) {
    const existing = getEvidenceEmbedding(row.id);
    if (needsEmbedding(existing, activeModel, opts.force)) {
      evidenceToEmbed.push(row);
    } else {
      evidenceSkipped += 1;
    }
  }

  const total = factsToEmbed.length + evidenceToEmbed.length;
  let done = 0;
  opts.onProgress?.("embedding facts", done, Math.max(total, 1));

  let dimensions = 0;
  let model = activeModel;
  let factsIndexed = 0;
  let evidenceIndexed = 0;

  if (factsToEmbed.length > 0) {
    const texts = factsToEmbed.map((f) =>
      safeIndexText(buildFactCard(f), f.claim || f.fact_type || f.id),
    );
    const result = await embedTexts(texts);
    model = result.model;
    dimensions = result.dimensions;
    for (let i = 0; i < factsToEmbed.length; i++) {
      upsertFactEmbedding({
        factId: factsToEmbed[i].id,
        model: result.model,
        embedding: result.vectors[i],
        indexText: texts[i],
      });
      factsIndexed += 1;
      done += 1;
      opts.onProgress?.("embedding facts", done, Math.max(total, 1));
    }
  }

  if (evidenceToEmbed.length > 0) {
    const texts = evidenceToEmbed.map((e) =>
      safeIndexText(
        buildEvidenceIndexText(e),
        e.quote || `evidence:${e.id}`,
      ),
    );
    const result = await embedTexts(texts);
    model = result.model;
    dimensions = result.dimensions || dimensions;
    for (let i = 0; i < evidenceToEmbed.length; i++) {
      upsertEvidenceEmbedding({
        evidenceId: evidenceToEmbed[i].id,
        model: result.model,
        embedding: result.vectors[i],
        indexText: texts[i],
      });
      evidenceIndexed += 1;
      done += 1;
      opts.onProgress?.("embedding evidence", done, Math.max(total, 1));
    }
  }

  return {
    factsIndexed,
    factsSkipped,
    evidenceIndexed,
    evidenceSkipped,
    model,
    dimensions,
  };
}
