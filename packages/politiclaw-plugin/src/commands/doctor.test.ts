import type { PluginCommandContext } from "openclaw/plugin-sdk/plugin-entry";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  configureStorage,
  resetStorageConfigForTests,
  setPluginConfigForTests,
  setStorageForTests,
} from "../storage/context.js";
import { Kv } from "../storage/kv.js";
import { openMemoryDb, type PolitiClawDb } from "../storage/sqlite.js";
import { doctorCommand } from "./doctor.js";

const fakeCtx = {} as unknown as PluginCommandContext;

function textOf(result: unknown): string {
  return (result as { text: string }).text;
}

let db: PolitiClawDb;

beforeEach(() => {
  db = openMemoryDb();
  configureStorage(() => "/tmp/politiclaw-tests");
  setStorageForTests({ db, kv: new Kv(db) });
  setPluginConfigForTests({ apiKeys: {} });
});

afterEach(() => {
  resetStorageConfigForTests();
});

describe("politiclaw-doctor command", () => {
  it("renders an overall worst status header and per-check markers on a bare install", async () => {
    const text = textOf(await doctorCommand.handler(fakeCtx));
    expect(text).toContain("PolitiClaw doctor — overall:");
    expect(text).toContain("[fail]");
    expect(text).toContain("API keys");
  });

  it("surfaces actionable hints for non-ok checks", async () => {
    const text = textOf(await doctorCommand.handler(fakeCtx));
    expect(text).toContain("politiclaw_configure");
  });

  it("renders a package diagnostic when storage cannot initialize", async () => {
    resetStorageConfigForTests();

    const text = textOf(await doctorCommand.handler(fakeCtx));
    expect(text).toContain("install/package check failed");
    expect(text).toContain("Storage initialization error:");
    expect(text).toContain("/politiclaw-version");
  });
});
