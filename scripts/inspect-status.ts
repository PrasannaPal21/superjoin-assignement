import { config } from "dotenv";
config();
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(process.env.DATABASE_PATH || "data/factlayer.db");
console.log(
  "DOCS",
  db
    .prepare(
      "SELECT original_filename, status, substr(coalesce(error_message,''),1,140) err FROM documents",
    )
    .all(),
);
console.log(
  "JOBS",
  db
    .prepare(
      "SELECT status, progress, progress_current, progress_total, substr(coalesce(error_message,''),1,120) err FROM jobs ORDER BY created_at DESC LIMIT 10",
    )
    .all(),
);
console.log(
  "REL",
  db.prepare("SELECT relation_type, count(*) c FROM relations GROUP BY relation_type").all(),
);
console.log(
  "FACTS",
  db
    .prepare(
      "SELECT d.original_filename AS file, count(f.id) AS c FROM documents d LEFT JOIN facts f ON f.document_id=d.id GROUP BY d.id",
    )
    .all(),
);
console.log(
  "FAIL",
  db
    .prepare(
      "SELECT stage, summary, substr(coalesce(detail,''),1,140) d FROM failures ORDER BY created_at DESC LIMIT 8",
    )
    .all(),
);
db.close();
