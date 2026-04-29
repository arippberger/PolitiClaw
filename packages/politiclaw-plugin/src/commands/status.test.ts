import type { PluginCommandContext } from "openclaw/plugin-sdk/plugin-entry";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { setOnboardingCheckpoint } from "../domain/onboarding/checkpoint.js";
import { upsertIssueStance, upsertPreferences } from "../domain/preferences/index.js";
import {
  configureStorage,
  resetStorageConfigForTests,
  setPluginConfigForTests,
  setStorageForTests,
} from "../storage/context.js";
import { Kv } from "../storage/kv.js";
import { openMemoryDb, type PolitiClawDb } from "../storage/sqlite.js";
import { statusCommand } from "./status.js";

const fakeCtx = {} as unknown as PluginCommandContext;

function textOf(result: unknown): string {
  return (result as { text: string }).text;
}

let db: PolitiClawDb;
let kv: Kv;

beforeEach(() => {
  db = openMemoryDb();
  kv = new Kv(db);
  configureStorage(() => "/tmp/politiclaw-tests");
  setStorageForTests({ db, kv });
  setPluginConfigForTests({ apiKeys: {} });
});

afterEach(() => {
  resetStorageConfigForTests();
});

describe("politiclaw-status command", () => {
  it("nudges the user to configure when no address is saved", async () => {
    const text = textOf(await statusCommand.handler(fakeCtx));
    expect(text).toContain("No address saved");
    expect(text).toContain("/politiclaw-setup");
    expect(text).toContain("Issue stances: 0");
    expect(text).toContain("API keys configured: 0/");
  });

  it("renders saved state, stance count, and key tally when populated", async () => {
    upsertPreferences(db, {
      address: "123 Main",
      zip: "94110",
      state: "CA",
      monitoringMode: "weekly_digest",
    });
    upsertIssueStance(db, { issue: "housing", stance: "support", weight: 3 });
    upsertIssueStance(db, { issue: "transit", stance: "support", weight: 2 });
    setPluginConfigForTests({
      apiKeys: { apiDataGov: "k", googleCivic: "k" },
    });

    const text = textOf(await statusCommand.handler(fakeCtx));
    expect(text).toContain("CA 94110");
    expect(text).toContain("Monitoring mode: weekly_digest");
    expect(text).toContain("Issue stances: 2");
    expect(text).toContain("API keys configured: 2/");
  });

  it("includes onboarding checkpoint state when setup is mid-flow", async () => {
    setOnboardingCheckpoint(kv, {
      stage: "monitoring",
      reason: "setup_progress",
      lastPromptSummary: "choose monitoring cadence",
    });

    const text = textOf(await statusCommand.handler(fakeCtx));
    expect(text).toContain("Setup checkpoint:");
    expect(text).toContain("monitoring");
    expect(text).toContain("/politiclaw-setup");
  });
});
