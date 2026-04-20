import type { PolitiClawDb } from "./sqlite.js";

/**
 * Tiny typed KV on top of the plugin SQLite DB.
 *
 * Used for scalar keys such as `lastPoll:*`, `rateLimit:*`,
 * `onboarding:completed`, and similar small records. Values are JSON-encoded
 * so we don't have to manage separate numeric/bool/object columns.
 */
export class Kv {
  private getStmt;
  private setStmt;
  private delStmt;

  constructor(private db: PolitiClawDb) {
    this.getStmt = db.prepare("SELECT value FROM kv_store WHERE key = ?");
    this.setStmt = db.prepare(
      "INSERT INTO kv_store (key, value, updated_at) VALUES (?, ?, ?) " +
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
    );
    this.delStmt = db.prepare("DELETE FROM kv_store WHERE key = ?");
  }

  get<T = unknown>(key: string): T | undefined {
    const row = this.getStmt.get(key) as { value: string } | undefined;
    if (!row) return undefined;
    return JSON.parse(row.value) as T;
  }

  set(key: string, value: unknown): void {
    this.setStmt.run(key, JSON.stringify(value), Date.now());
  }

  delete(key: string): void {
    this.delStmt.run(key);
  }
}
