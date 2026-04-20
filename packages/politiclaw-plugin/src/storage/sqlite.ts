import Database from "better-sqlite3";
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type PolitiClawDb = Database.Database;

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "migrations");

export type OpenDbOptions = {
  /** Directory holding the plugin-private SQLite file. */
  dbDir: string;
  /** Overrideable in tests. Defaults to "politiclaw.db". */
  filename?: string;
  /** Skip mkdir/migrate — used by in-memory tests that supply their own path. */
  skipInit?: boolean;
};

export function openDb(opts: OpenDbOptions): PolitiClawDb {
  const filename = opts.filename ?? "politiclaw.db";
  if (!opts.skipInit) mkdirSync(opts.dbDir, { recursive: true });
  const db = new Database(join(opts.dbDir, filename));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

export function openMemoryDb(): PolitiClawDb {
  const db = new Database(":memory:");
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
