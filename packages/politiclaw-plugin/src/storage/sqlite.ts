import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type PolitiClawRunResult = {
  changes: number | bigint;
  lastInsertRowid: number | bigint;
};

export type PolitiClawStatement = {
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
  iterate(...params: unknown[]): IterableIterator<unknown>;
  run(...params: unknown[]): PolitiClawRunResult;
};

export type PolitiClawDb = {
  exec(sql: string): void;
  prepare(sql: string): PolitiClawStatement;
  pragma(pragma: string, options?: { simple?: boolean }): unknown;
  transaction<T>(fn: () => T): () => T;
  close(): void;
};

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "migrations");

export type OpenDbOptions = {
  /** Directory holding the plugin-private SQLite file. */
  dbDir: string;
  /** Overrideable in tests. Defaults to "politiclaw.db". */
  filename?: string;
  /** Skip mkdir/migrate — used by in-memory tests that supply their own path. */
  skipInit?: boolean;
};

class SqliteDb implements PolitiClawDb {
  private readonly db: DatabaseSync;
  private transactionCounter = 0;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  prepare(sql: string): PolitiClawStatement {
    const statement = this.db.prepare(sql);
    return {
      all: (...params: unknown[]) =>
        (statement.all as (...args: unknown[]) => unknown[])(...params),
      get: (...params: unknown[]) =>
        (statement.get as (...args: unknown[]) => unknown)(...params),
      iterate: (...params: unknown[]) =>
        (statement.iterate as (...args: unknown[]) => IterableIterator<unknown>)(...params),
      run: (...params: unknown[]) =>
        (statement.run as (...args: unknown[]) => PolitiClawRunResult)(...params),
    };
  }

  pragma(pragma: string, options?: { simple?: boolean }): unknown {
    const rows = this.db.prepare(`PRAGMA ${pragma}`).all() as Array<Record<string, unknown>>;
    if (!options?.simple) return rows;
    const firstRow = rows[0];
    if (!firstRow) return undefined;
    return Object.values(firstRow)[0];
  }

  transaction<T>(fn: () => T): () => T {
    return () => {
      const savepoint = `politiclaw_tx_${++this.transactionCounter}`;
      this.db.exec(`SAVEPOINT ${savepoint}`);
      try {
        const result = fn();
        this.db.exec(`RELEASE SAVEPOINT ${savepoint}`);
        return result;
      } catch (error) {
        try {
          this.db.exec(`ROLLBACK TO SAVEPOINT ${savepoint}`);
          this.db.exec(`RELEASE SAVEPOINT ${savepoint}`);
        } catch {
          // Ignore rollback cleanup failures and rethrow the original error.
        }
        throw error;
      }
    };
  }

  close(): void {
    this.db.close();
  }
}

export function openDb(opts: OpenDbOptions): PolitiClawDb {
  const filename = opts.filename ?? "politiclaw.db";
  if (!opts.skipInit) mkdirSync(opts.dbDir, { recursive: true });
  const db = new SqliteDb(join(opts.dbDir, filename));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

export function openMemoryDb(): PolitiClawDb {
  const db = new SqliteDb(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

function migrate(db: PolitiClawDb): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY
  )`);

  const current = (db.prepare("SELECT MAX(version) AS v FROM schema_version").get() as { v: number | null }).v ?? 0;

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const insertVersion = db.prepare("INSERT INTO schema_version (version) VALUES (?)");

  for (const file of files) {
    const version = parseInt(file.slice(0, 4), 10);
    if (Number.isNaN(version)) continue;
    if (version <= current) continue;
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    db.transaction(() => {
      db.exec(sql);
      insertVersion.run(version);
    })();
  }
}
