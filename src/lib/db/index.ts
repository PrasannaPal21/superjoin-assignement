import { migrateDocumentsAndJobs } from "./migrate-documents";
import { migrateFactsAndRelations } from "./migrate-facts";

export function ensureDb(): void {
  migrateDocumentsAndJobs();
  migrateFactsAndRelations();
}
