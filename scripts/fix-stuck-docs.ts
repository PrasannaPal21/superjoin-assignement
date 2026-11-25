/**
 * Mark documents stuck in processing/queued with no running job as ready
 * (if they have facts) or failed, then rematch.
 */
import { config } from "dotenv";
config();
import { ensureDb } from "../src/lib/db";
import { getDb } from "../src/lib/db/client";
import { updateDocumentStatus } from "../src/lib/db/documents";
import { rematchAllDocuments } from "../src/lib/pipeline/match";

ensureDb();
const db = getDb();

const stuck = db
  .prepare(
    `SELECT d.id, d.original_filename, d.status,
            (SELECT COUNT(*) FROM facts f WHERE f.document_id = d.id) AS fact_count,
            (SELECT COUNT(*) FROM jobs j WHERE j.document_id = d.id AND j.status = 'running') AS running
     FROM documents d
     WHERE d.status IN ('processing', 'queued')`,
  )
  .all() as Array<{
  id: string;
  original_filename: string;
  status: string;
  fact_count: number;
  running: number;
}>;

for (const row of stuck) {
  if (row.running > 0) {
    console.log("skip (still running)", row.original_filename);
    continue;
  }
  if (row.fact_count > 0) {
    updateDocumentStatus(row.id, "ready");
    console.log(
      "marked ready",
      row.original_filename,
      `(${row.fact_count} facts)`,
    );
  } else {
    updateDocumentStatus(row.id, "failed", {
      error_message: "Stuck with no facts and no running job — re-upload",
    });
    console.log("marked failed", row.original_filename);
  }
}

async function main() {
  console.log("rematching…");
  const result = await rematchAllDocuments();
  console.log(result);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
