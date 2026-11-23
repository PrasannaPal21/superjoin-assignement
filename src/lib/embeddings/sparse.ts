import {
  averageSparseDocLength,
  countSparseDocs,
  documentFrequency,
  listPostingsForToken,
  upsertFactSparseIndex,
} from "@/lib/db/sparse";
import { listFacts } from "@/lib/db/facts";
import { buildFactCard, tokenizeIndexText } from "@/lib/embeddings/index-text";

/** Okapi BM25 defaults. */
export const BM25_K1 = 1.2;
export const BM25_B = 0.75;

export type SparseHit = {
  factId: string;
  score: number;
};

export type SparseSearchOptions = {
  /** Exclude facts from this document (Compare path). */
  excludeDocumentId?: string;
};

export type IndexSparseResult = {
  factsIndexed: number;
};

export function termFrequencies(tokens: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of tokens) {
    m.set(t, (m.get(t) ?? 0) + 1);
  }
  return m;
}

/**
 * IDF as used by Lucene / Okapi BM25+:
 * ln(1 + (N - df + 0.5) / (df + 0.5))
 */
export function bm25Idf(N: number, df: number): number {
  const n = Math.max(N, 1);
  const d = Math.max(df, 0);
  return Math.log(1 + (n - d + 0.5) / (d + 0.5));
}

export function bm25TermScore(opts: {
  tf: number;
  docLen: number;
  avgdl: number;
  idf: number;
  k1?: number;
  b?: number;
}): number {
  const k1 = opts.k1 ?? BM25_K1;
  const b = opts.b ?? BM25_B;
  const avgdl = opts.avgdl > 0 ? opts.avgdl : 1;
  const denom =
    opts.tf + k1 * (1 - b + b * (opts.docLen / avgdl));
  if (denom <= 0) return 0;
  return opts.idf * ((opts.tf * (k1 + 1)) / denom);
}

/** Index (or refresh) sparse postings for one fact from a card string. */
export function indexFactSparse(factId: string, indexText: string): void {
  const tokens = tokenizeIndexText(indexText);
  upsertFactSparseIndex({
    factId,
    tokenCount: Math.max(tokens.length, 1),
    indexText,
    termFrequencies: termFrequencies(tokens),
  });
}

/** Build sparse postings for every fact in a document (ingest). */
export function indexDocumentSparse(documentId: string): IndexSparseResult {
  const facts = listFacts(documentId);
  let factsIndexed = 0;
  for (const fact of facts) {
    const card = buildFactCard(fact);
    const text =
      card.replace(/\s+/g, " ").trim() ||
      (fact.claim || fact.fact_type || fact.id);
    indexFactSparse(fact.id, text);
    factsIndexed += 1;
  }
  return { factsIndexed };
}

/**
 * BM25 search over active fact sparse index.
 * Exit criterion for embeddings step 5: returns ranked fact ids.
 */
export function sparseSearch(
  query: string,
  topK = 20,
  opts: SparseSearchOptions = {},
): SparseHit[] {
  const tokens = [...new Set(tokenizeIndexText(query))];
  if (tokens.length === 0 || topK <= 0) return [];

  const scope = { excludeDocumentId: opts.excludeDocumentId };
  const N = countSparseDocs(scope);
  if (N === 0) return [];
  const avgdl = averageSparseDocLength(scope);

  const scores = new Map<string, number>();

  for (const token of tokens) {
    const df = documentFrequency(token, scope);
    if (df === 0) continue;
    const idf = bm25Idf(N, df);
    const postings = listPostingsForToken(token, scope);
    for (const row of postings) {
      const add = bm25TermScore({
        tf: row.tf,
        docLen: row.token_count,
        avgdl,
        idf,
      });
      scores.set(row.fact_id, (scores.get(row.fact_id) ?? 0) + add);
    }
  }

  return [...scores.entries()]
    .map(([factId, score]) => ({ factId, score }))
    .sort((a, b) => b.score - a.score || a.factId.localeCompare(b.factId))
    .slice(0, topK);
}
