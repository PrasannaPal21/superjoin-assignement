import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";
import fs from "fs";
import { ensureDb } from "@/lib/db";
import { closeDb, getDbPath } from "@/lib/db/client";
import { insertDocument } from "@/lib/db/documents";
import { getFactSparseDoc } from "@/lib/db/sparse";
import { insertFact } from "@/lib/db/facts";
import {
  bm25Idf,
  bm25TermScore,
  indexDocumentSparse,
  sparseSearch,
  termFrequencies,
} from "@/lib/embeddings/sparse";
import { tokenizeIndexText } from "@/lib/embeddings/index-text";

describe("sparse / BM25 (embeddings step 5)", () => {
  const prevDb = process.env.DATABASE_PATH;
  const testDb = "data/test-sparse.db";

  beforeAll(() => {
    process.env.DATABASE_PATH = testDb;
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
    closeDb();
  });

  it("computes term frequencies and BM25 helpers", () => {
    const tf = termFrequencies(tokenizeIndexText("revenue revenue crore"));
    expect(tf.get("revenue")).toBe(2);
    expect(tf.get("crore")).toBe(1);
    expect(bm25Idf(100, 5)).toBeGreaterThan(bm25Idf(100, 50));
    expect(
      bm25TermScore({ tf: 2, docLen: 10, avgdl: 10, idf: 1 }),
    ).toBeGreaterThan(0);
  });

  it("indexes facts and returns ranked ids from sparseSearch", () => {
    expect(getDbPath()).toContain("test-sparse");

    const docA = randomUUID();
    const docB = randomUUID();
    const revenueId = randomUUID();
    const ebitdaId = randomUUID();
    const fleetId = randomUUID();

    for (const id of [docA, docB]) {
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

    insertFact({
      id: revenueId,
      document_id: docA,
      chunk_id: null,
      claim: "Revenue from operations",
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
    });
    insertFact({
      id: ebitdaId,
      document_id: docA,
      chunk_id: null,
      claim: "EBITDA margin",
      raw_value: "8.2",
      numeric_value: 8.2,
      unit: "percent",
      period: "FY24",
      scope: null,
      entity: "Delhivery",
      fact_type: "ebitda",
      confidence: 0.9,
      status: "active",
      match_key: "delhivery|ebitda|percent",
    });
    insertFact({
      id: fleetId,
      document_id: docB,
      chunk_id: null,
      claim: "Fleet size",
      raw_value: "12000",
      numeric_value: 12000,
      unit: "vehicles",
      period: "FY24",
      scope: null,
      entity: "Delhivery",
      fact_type: "fleet",
      confidence: 0.9,
      status: "active",
      match_key: "delhivery|fleet|vehicles",
    });

    const indexed = indexDocumentSparse(docA);
    expect(indexed.factsIndexed).toBe(2);
    expect(indexed.evidenceIndexed).toBe(0);
    indexDocumentSparse(docB);

    expect(getFactSparseDoc(revenueId)?.token_count).toBeGreaterThan(0);

    const hits = sparseSearch("revenue from operations crore", 5);
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0].factId).toBe(revenueId);
    expect(hits[0].score).toBeGreaterThan(0);

    const outside = sparseSearch("revenue crore", 5, {
      excludeDocumentId: docA,
    });
    expect(outside.every((h) => h.factId !== revenueId)).toBe(true);
    expect(outside.every((h) => h.factId !== ebitdaId)).toBe(true);
  });
});
