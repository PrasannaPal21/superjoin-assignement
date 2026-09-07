import fs from "fs";
import path from "path";
import { DatabaseSync } from "node:sqlite";

const DEFAULT_DB = "data/factlayer.db";

type SqlDb = DatabaseSync;
type SqlStmt = ReturnType<DatabaseSync["prepare"]>;

let dbInstance: SqlDb | null = null;

export function getDbPath(): string {
  return process.env.DATABASE_PATH || DEFAULT_DB;
}

/**
 * Thin wrapper so existing `.prepare().run/get/all` call sites keep working.
 * Uses Node's built-in SQLite (no native addon) — avoids Render segfaults from better-sqlite3.
 */
function wrapStatement(stmt: SqlStmt) {
  const bind = (args: unknown[]) => {
    if (
      args.length === 1 &&
      typeof args[0] === "object" &&
      args[0] !== null &&
      !Array.isArray(args[0]) &&
      !(args[0] instanceof Buffer)
    ) {
      const src = args[0] as Record<string, unknown>;
      const named: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(src)) {
        named[key] = value;
        named[`@${key}`] = value;
        named[`$${key}`] = value;
        named[`:${key}`] = value;
      }
      return named;
    }
    return null;
  };

  return {
    run(...args: unknown[]) {
      const named = bind(args);
      return named ? stmt.run(named) : stmt.run(...(args as never[]));
    },
    get(...args: unknown[]) {
      const named = bind(args);
      return named ? stmt.get(named) : stmt.get(...(args as never[]));
    },
    all(...args: unknown[]) {
      const named = bind(args);
      return named ? stmt.all(named) : stmt.all(...(args as never[]));
    },
  };
}

export type AppDatabase = {
  prepare: (sql: string) => ReturnType<typeof wrapStatement>;
  exec: (sql: string) => void;
  close: () => void;
};

export function getDb(): AppDatabase {
  if (dbInstance) {
    return wrapDb(dbInstance);
  }

  const dbPath = getDbPath();
  const dir = path.dirname(path.resolve(dbPath));
  fs.mkdirSync(dir, { recursive: true });

  // DELETE journal is safer on ephemeral Render disks than WAL.
  const raw = new DatabaseSync(dbPath);
  raw.exec("PRAGMA journal_mode = DELETE;");
  raw.exec("PRAGMA foreign_keys = ON;");
  dbInstance = raw;
  return wrapDb(raw);
}

function wrapDb(raw: SqlDb): AppDatabase {
  return {
    prepare(sql: string) {
      return wrapStatement(raw.prepare(sql));
    },
    exec(sql: string) {
      raw.exec(sql);
    },
    close() {
      raw.close();
    },
  };
}

export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
