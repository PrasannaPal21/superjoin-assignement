import { migrateDocumentsAndJobs } from "./migrate-documents";

export function ensureDb(): void {
  migrateDocumentsAndJobs();
}
