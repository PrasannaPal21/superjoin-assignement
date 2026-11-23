/**
 * Offline smoke for hybrid recall (no MiniLM download).
 * Seeds paraphrase fixtures + fake vectors, runs hybridRetrieveForFact.
 *
 * Usage: npx tsx scripts/smoke-hybrid.ts
 */
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { ensureDb } from "../src/lib/db";
import { closeDb } from "../src/lib/db/client";
import { insertDocument } from "../src/lib/db/documents";
import { upsertFactEmbedding } from "../src/lib/db/embeddings";
import { insertFact } from "../src/lib/db/facts";
import { l2Normalize } from "../src/lib/embeddings/client";
import {
  PARAPHRASE_PAIR,
  fixtureFactCard,
  jaccardTokenOverlap,
  type FixtureFact,
} from "../src/lib/embeddings/fixtures";
import { hybridRetrieveForFact } from "../src/lib/embeddings/hybrid";
import { indexDocumentSparse } from "../src/lib/embeddings/sparse";

async function main() {
  const testDb = path.join("data", `smoke-hybrid-${Date.now()}.db`);
  const prev = process.env.DATABASE_PATH;
  process.env.DATABASE_PATH = testDb;
  process.env.EMBEDDING_MODEL =
    process.env.EMBEDDING_MODEL || "Xenova/all-MiniLM-L6-v2";
  const model = process.env.EMBEDDING_MODEL;

  closeDb();
  ensureDb();

  try {
    const { left, right, unrelated, jaccardCeiling } = PARAPHRASE_PAIR;
    const j = jaccardTokenOverlap(
      fixtureFactCard(left),
      fixtureFactCard(right),
    );
    console.log("jaccard(paraphrase)", j.toFixed(3), "ceiling", jaccardCeiling);
    if (j >= jaccardCeiling) {
      throw new Error("Fixture Jaccard too high — not a useful miss case");
    }

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

    const seed = (
      id: string,
      docId: string,
      f: FixtureFact,
      vec: number[],
    ) => {
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
      upsertFactEmbedding({
        factId: id,
        model,
        embedding: vec,
        indexText: fixtureFactCard(f),
      });
    };

    seed(leftId, docNew, left, l2Normalize([1, 0.2, 0.05, 0]));
    seed(rightId, docOld, right, l2Normalize([0.97, 0.22, 0.04, 0]));
    seed(unrelatedId, docOld, unrelated, l2Normalize([0, 0, 1, 0.2]));
    indexDocumentSparse(docNew);
    indexDocumentSparse(docOld);

    const hits = hybridRetrieveForFact(
      {
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
      },
      { excludeDocumentId: docNew },
    );

    console.log(
      "hybrid hits",
      hits.map((h) => ({
        id: h.factId.slice(0, 8),
        score: Number(h.score.toFixed(4)),
        channels: h.channels.join("+"),
        boosts: h.boosts.join("+") || "-",
      })),
    );

    const recovered = hits.find((h) => h.factId === rightId);
    if (!recovered) {
      throw new Error("Paraphrase pair not recovered by hybrid recall");
    }
    console.log("OK: paraphrase recovered via", recovered.channels.join("+"));
  } finally {
    closeDb();
    try {
      fs.unlinkSync(testDb);
    } catch {
      /* ignore */
    }
    if (prev === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = prev;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
