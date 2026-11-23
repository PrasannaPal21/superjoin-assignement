import { migrateChunkHierarchy } from "./migrate-chunks";
import { migrateDocumentsAndJobs } from "./migrate-documents";
import { migrateEmbeddings } from "./migrate-embeddings";
import { migrateFactsAndRelations } from "./migrate-facts";
import { migrateSparse } from "./migrate-sparse";

export function ensureDb(): void {
  migrateDocumentsAndJobs();
  migrateChunkHierarchy();
  migrateFactsAndRelations();
  migrateEmbeddings();
  migrateSparse();
}
