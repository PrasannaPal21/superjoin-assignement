import { migrateChunkHierarchy } from "./migrate-chunks";
import { migrateDocumentsAndJobs } from "./migrate-documents";
import { migrateEmbeddings } from "./migrate-embeddings";
import { migrateFactsAndRelations } from "./migrate-facts";

export function ensureDb(): void {
  migrateDocumentsAndJobs();
  migrateChunkHierarchy();
  migrateFactsAndRelations();
  migrateEmbeddings();
}
