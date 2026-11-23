import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "crypto";
import fs from "fs";
import { ensureDb } from "@/lib/db";
import { closeDb } from "@/lib/db/client";
import { insertDocument } from "@/lib/db/documents";
import { upsertEvidenceEmbedding } from "@/lib/db/embeddings";
import { getEvidenceSparseDoc } from "@/lib/db/sparse";
import { insertEvidence, insertFact } from "@/lib/db/facts";
import { l2Normalize } from "@/lib/embeddings/client";
import { hybridRetrieveEvidence } from "@/lib/embeddings/hybrid-ask";
import { indexDocumentSparse, sparseSearchEvidence } from "@/lib/embeddings/sparse";

vi.mock("@/lib/embeddings/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/embeddings/client")>();
  return {
    ...actual,
    embedText: vi.fn(async () => l2Normalize([1, 0.1, 0, 0])),
  };
});

describe("evidence Ask prep (embeddings step 9)", () => {
  const prevDb = process.env.DATABASE_PATH;
  const prevModel = process.env.EMBEDDING_MODEL;
  const testDb = "data/test-hybrid-ask.db";
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

  it("indexes evidence sparsely and hybrid-retrieves citation-ready hits", async () => {
    const docId = randomUUID();
    const factId = randomUUID();
    const evidenceId = randomUUID();
    const otherEvidenceId = randomUUID();
    const otherFactId = randomUUID();

    insertDocument({
      id: docId,
      original_filename: "t.pdf",
      stored_path: "data/uploads/t.pdf",
      mime_type: "application/pdf",
      byte_size: 1,
      content_hash: randomUUID(),
      status: "ready",
    });
    insertFact({
      id: factId,
      document_id: docId,
      chunk_id: null,
      claim: "Revenue from operations",
      raw_value: "8143",
      numeric_value: 8143,
      unit: "crore",
      period: "FY24",
      scope: null,
      entity: "Delhivery",
      fact_type: "revenue",
      confidence: 0.9,
      status: "active",
      match_key: "delhivery|revenue|crore",
    });
    insertFact({
      id: otherFactId,
      document_id: docId,
      chunk_id: null,
      claim: "Fleet size",
      raw_value: "100",
      numeric_value: 100,
      unit: "vehicles",
      period: "FY24",
      scope: null,
      entity: "Delhivery",
      fact_type: "fleet",
      confidence: 0.9,
      status: "active",
      match_key: "delhivery|fleet|vehicles",
    });
    insertEvidence({
      id: evidenceId,
      fact_id: factId,
      document_id: docId,
      page: 12,
      quote: "Revenue from operations was 8143 crore in Fiscal 2024",
    });
    insertEvidence({
      id: otherEvidenceId,
      fact_id: otherFactId,
      document_id: docId,
      page: 40,
      quote: "Owned fleet stood at 100 vehicles",
    });

    const indexed = indexDocumentSparse(docId);
    expect(indexed.evidenceIndexed).toBe(2);
    expect(getEvidenceSparseDoc(evidenceId)?.token_count).toBeGreaterThan(0);

    const sparseHits = sparseSearchEvidence("revenue operations crore", 5);
    expect(sparseHits[0]?.evidenceId).toBe(evidenceId);

    upsertEvidenceEmbedding({
      evidenceId,
      model,
      embedding: l2Normalize([1, 0.1, 0, 0]),
      indexText: "page=12 | Revenue from operations was 8143 crore",
    });
    upsertEvidenceEmbedding({
      evidenceId: otherEvidenceId,
      model,
      embedding: l2Normalize([0, 0, 1, 0.2]),
      indexText: "page=40 | Owned fleet stood at 100 vehicles",
    });

    const hits = await hybridRetrieveEvidence(
      "What was revenue from operations?",
      {
        queryVector: l2Normalize([1, 0.12, 0.02, 0]),
      },
    );
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0].evidenceId).toBe(evidenceId);
    expect(hits[0].factId).toBe(factId);
    expect(hits[0].page).toBe(12);
    expect(hits[0].quote).toMatch(/Revenue from operations/i);
    expect(hits[0].channels.length).toBeGreaterThan(0);
  });
});
