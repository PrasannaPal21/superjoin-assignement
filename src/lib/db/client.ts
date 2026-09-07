import fs from "fs";
import path from "path";
import Database from "better-sqlite3";

const DEFAULT_DB = "data/factlayer.db";

let dbInstance: Database.Database | null = null;

export function getDbPath(): string {
  return process.env.DATABASE_PATH || DEFAULT_DB;
}

export function getDb(): Database.Database {
  if (dbInstance) return dbInstance;

  const dbPath = getDbPath();
  const dir = path.dirname(path.resolve(dbPath));
  fs.mkdirSync(dir, { recursive: true });

  dbInstance = new Database(dbPath);
  dbInstance.pragma("journal_mode = WAL");
  dbInstance.pragma("foreign_keys = ON");
  return dbInstance;
}

export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
