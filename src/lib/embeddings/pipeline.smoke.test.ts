import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";
import fs from "fs";
import { ensureDb } from "@/lib/db";
import { closeDb } from "@/lib/db/client";
import { insertDocument } from "@/lib/db/documents";
import { upsertFactEmbedding } from "@/lib/db/embeddings";
import { insertFact } from "@/lib/db/facts";
import { l2Normalize } from "@/lib/embeddings/client";
import {
  FACT_CARD_FIXTURES,
  PARAPHRASE_PAIR,
  fixtureFactCard,
  jaccardTokenOverlap,
  type FixtureFact,
} from "@/lib/embeddings/fixtures";
import { hybridRetrieveForFact } from "@/lib/embeddings/hybrid";
import { buildFactCard } from "@/lib/embeddings/index-text";
import { reciprocalRankFusion } from "@/lib/embeddings/rrf";
import { indexDocumentSparse } from "@/lib/embeddings/sparse";
import { findCandidatePairs } from "@/lib/pipeline/match-candidates";

/**
 * Embeddings pipeline step 10 — consolidated smoke:
 * fact-card format, RRF, paraphrase pair Jaccard-missed but hybrid-recovered.
 */
describe("embeddings pipeline smoke (step 10)", () => {
  const prevDb = process.env.DATABASE_PATH;
  const prevModel = process.env.EMBEDDING_MODEL;
  const testDb = "data/test-pipeline-smoke.db";
  const model = "Xenova/all-MiniLM-L6-v2";

  beforeAll(() => {
    process.env.DATABASE_PATH = testDb;
    process.env.EMBEDDING_MODEL = model;
    closeDb();
    try {
      fs.unlinkSync(testDb);
    } catch {
      /* fresh */
    }
    ensureDb();
  });

  afterAll(() => {
    closeDb();
    try {
      fs.unlinkSync(testDb);
    } catch {
      /* ignore */
    }
    if (prevDb === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = prevDb;
    if (prevModel === undefined) delete process.env.EMBEDDING_MODEL;
    else process.env.EMBEDDING_MODEL = prevModel;
    closeDb();
  });

  it("locks fact-card string format", () => {
    for (const row of FACT_CARD_FIXTURES) {
      expect(buildFactCard(row.input)).toBe(row.card);
    }
  });

  it("RRF prefers multi-list agreement", () => {
    const fused = reciprocalRankFusion(
      [
        ["para", "noise"],
        ["noise", "para"],
        ["para"],
      ],
      { k: 60, topN: 3 },
    );
    expect(fused[0].id).toBe("para");
  });

  it("paraphrase pair is weak on Jaccard but recovered by hybrid+RRF", () => {
    const { left, right, unrelated, jaccardCeiling } = PARAPHRASE_PAIR;
    const j = jaccardTokenOverlap(
      fixtureFactCard(left),
      fixtureFactCard(right),
    );
    expect(j).toBeLessThan(jaccardCeiling);
    expect(left.matchKey).not.toBe(right.matchKey);

    const docNew = randomUUID();
    const docOld = randomUUID();
    const leftId = randomUUID();
    const rightId = randomUUID();
    const unrelatedId = randomUUID();

    for (const id of [docNew, docOld]) {
      insertDocument({
        id,
        original_filename: `${id}.pdf`,
        stored_path: `data/uploads/${id}.pdf`,
        mime_type: "application/pdf",
        byte_size: 1,
        content_hash: randomUUID(),
        status: "ready",
      });
    }

    const insert = (id: string, docId: string, f: FixtureFact) => {
      insertFact({
        id,
        document_id: docId,
        chunk_id: null,
        claim: f.claim,
        raw_value: f.rawValue,
        numeric_value: Number(f.rawValue),
        unit: f.unit,
        period: f.period,
        scope: f.scope,
        entity: f.entity,
        fact_type: f.factType,
        confidence: 0.9,
        status: "active",
        match_key: f.matchKey,
      });
    };

    insert(leftId, docNew, left);
    insert(rightId, docOld, right);
    insert(unrelatedId, docOld, unrelated);

    const revenueDir = l2Normalize([1, 0.2, 0.05, 0]);
    upsertFactEmbedding({
      factId: leftId,
      model,
      embedding: revenueDir,
      indexText: fixtureFactCard(left),
    });
    upsertFactEmbedding({
      factId: rightId,
      model,
      embedding: l2Normalize([0.97, 0.22, 0.04, 0]),
      indexText: fixtureFactCard(right),
    });
    upsertFactEmbedding({
      factId: unrelatedId,
      model,
      embedding: l2Normalize([0, 0, 1, 0.2]),
      indexText: fixtureFactCard(unrelated),
    });

    indexDocumentSparse(docNew);
    indexDocumentSparse(docOld);

    const queryFact = {
      id: leftId,
      document_id: docNew,
      chunk_id: null,
      claim: left.claim,
      raw_value: left.rawValue,
      numeric_value: Number(left.rawValue),
      unit: left.unit,
      period: left.period,
      scope: left.scope,
      entity: left.entity,
      fact_type: left.factType,
      confidence: 0.9,
      status: "active",
      match_key: left.matchKey,
      created_at: new Date().toISOString(),
    };

    const hits = hybridRetrieveForFact(queryFact, {
      excludeDocumentId: docNew,
    });
    expect(hits.some((h) => h.factId === rightId)).toBe(true);
    expect(
      (hits.find((h) => h.factId === rightId)?.score ?? 0) >
        (hits.find((h) => h.factId === unrelatedId)?.score ?? 0),
    ).toBe(true);

    const pairs = findCandidatePairs(docNew, 10);
    expect(pairs.some((p) => p.right.id === rightId)).toBe(true);
  });
});
