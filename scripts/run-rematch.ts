import { ensureDb } from "../src/lib/db";
import { getDb } from "../src/lib/db/client";
import { rematchAllDocuments } from "../src/lib/pipeline/match";

async function main() {
  ensureDb();
  const result = await rematchAllDocuments();
  console.log("rematch", result);
  const counts = getDb()
    .prepare(
      `SELECT relation_type, COUNT(*) AS c FROM relations GROUP BY relation_type ORDER BY c DESC`,
    )
    .all();
  console.log("relations", counts);
  const samples = getDb()
    .prepare(
      `SELECT r.relation_type, r.confidence, r.rationale,
              a.claim AS a_claim, a.numeric_value AS a_num, a.unit AS a_unit, a.period AS a_period, a.fact_type AS a_type,
              b.claim AS b_claim, b.numeric_value AS b_num, b.unit AS b_unit, b.period AS b_period, b.fact_type AS b_type
       FROM relations r
       JOIN facts a ON a.id = r.fact_a_id
       JOIN facts b ON b.id = r.fact_b_id
       WHERE r.relation_type IN ('corroborates', 'contradicts')
       ORDER BY r.relation_type, r.confidence DESC
       LIMIT 20`,
    )
    .all();
  console.log("agrees/conflicts samples", JSON.stringify(samples, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
