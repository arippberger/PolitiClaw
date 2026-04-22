import { join } from "node:path";
import { openDb, type PolitiClawDb } from "./sqlite.js";
import { Kv } from "./kv.js";

export type PolitiClawStorage = {
  db: PolitiClawDb;
  kv: Kv;
};

export type PluginConfigSnapshot = {
  apiKeys?: {
    apiDataGov?: string;
    geocodio?: string;
    openStates?: string;
    legiscan?: string;
    openSecrets?: string;
    followTheMoney?: string;
    voteSmart?: string;
    democracyWorks?: string;
    cicero?: string;
    ballotReady?: string;
    googleCivic?: string;
  };
  sources?: {
    bills?: {
      /** Self-hosted unitedstates/congress scraper output mirror. */
      scraperBaseUrl?: string;
    };
  };
};

let storage: PolitiClawStorage | null = null;
let resolveStateDir: (() => string) | null = null;
let resolvePluginConfig: (() => PluginConfigSnapshot) | null = null;

/**
 * Called once from `register(api)` with the SDK's state-dir resolver and a
 * plugin-config accessor. We don't open the DB eagerly — we wait until the
 * first tool call so plugin boot stays cheap and test harnesses can override
 * with `setStorageForTests` / `setPluginConfigForTests`.
 */
export function configureStorage(
  stateDirResolver: () => string,
  pluginConfigResolver: () => PluginConfigSnapshot = () => ({}),
): void {
  resolveStateDir = stateDirResolver;
  resolvePluginConfig = pluginConfigResolver;
}

export function getStorage(): PolitiClawStorage {
  if (storage) return storage;
  if (!resolveStateDir) {
    throw new Error("politiclaw storage: configureStorage() was not called");
  }
  const dbDir = join(resolveStateDir(), "plugins", "politiclaw");
  const db = openDb({ dbDir });
  storage = { db, kv: new Kv(db) };
  return storage;
}

export function getStateDir(): string {
  if (!resolveStateDir) {
    throw new Error("politiclaw storage: configureStorage() was not called");
  }
  return resolveStateDir();
}

export function getPluginConfig(): PluginConfigSnapshot {
  if (!resolvePluginConfig) return {};
  return resolvePluginConfig();
}

export function setStorageForTests(next: PolitiClawStorage | null): void {
  storage = next;
}

export function setPluginConfigForTests(cfg: PluginConfigSnapshot | null): void {
  resolvePluginConfig = cfg ? () => cfg : null;
}

export function resetStorageConfigForTests(): void {
  storage = null;
  resolveStateDir = null;
  resolvePluginConfig = null;
}
