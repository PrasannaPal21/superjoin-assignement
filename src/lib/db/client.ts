import fs from "fs";
import path from "path";
import { DatabaseSync } from "node:sqlite";

const DEFAULT_DB = "data/factlayer.db";

type SqlDb = DatabaseSync;

let dbInstance: SqlDb | null = null;

export function getDbPath(): string {
  return process.env.DATABASE_PATH || DEFAULT_DB;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Buffer)
  );
}

/** Convert better-sqlite3-style @name placeholders to positional ? for node:sqlite. */
function rewriteNamedSql(sql: string): { sql: string; names: string[] } {
  const names: string[] = [];
  const rewritten = sql.replace(/@([A-Za-z_][A-Za-z0-9_]*)/g, (_m, name: string) => {
    names.push(name);
    return "?";
  });
  return { sql: rewritten, names };
}

function resolveArgs(names: string[], args: unknown[]): unknown[] {
  if (names.length > 0 && args.length === 1 && isPlainObject(args[0])) {
    const obj = args[0];
    return names.map((name) => {
      if (!(name in obj)) {
        throw new Error(`Missing SQL bind parameter: ${name}`);
      }
      return obj[name];
    });
  }
  return args;
}

function wrapStatement(rawSql: string, db: SqlDb) {
  const { sql, names } = rewriteNamedSql(rawSql);
  const stmt = db.prepare(sql);

  return {
    run(...args: unknown[]) {
      const values = resolveArgs(names, args);
      return stmt.run(...(values as never[]));
    },
    get(...args: unknown[]) {
      const values = resolveArgs(names, args);
      return stmt.get(...(values as never[]));
    },
    all(...args: unknown[]) {
      const values = resolveArgs(names, args);
      return stmt.all(...(values as never[]));
    },
  };
}

export type AppDatabase = {
  prepare: (sql: string) => ReturnType<typeof wrapStatement>;
  exec: (sql: string) => void;
  close: () => void;
};

function wrapDb(raw: SqlDb): AppDatabase {
  return {
    prepare(sql: string) {
      return wrapStatement(sql, raw);
    },
    exec(sql: string) {
      raw.exec(sql);
    },
    close() {
      raw.close();
    },
  };
}

export function getDb(): AppDatabase {
  if (dbInstance) {
    return wrapDb(dbInstance);
  }

  const dbPath = getDbPath();
  const dir = path.dirname(path.resolve(dbPath));
  fs.mkdirSync(dir, { recursive: true });

  const raw = new DatabaseSync(dbPath);
  raw.exec("PRAGMA journal_mode = DELETE;");
  raw.exec("PRAGMA foreign_keys = ON;");
  dbInstance = raw;
  return wrapDb(raw);
}

export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
