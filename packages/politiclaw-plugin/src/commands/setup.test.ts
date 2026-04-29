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
import { setupCommand } from "./setup.js";

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

describe("politiclaw-setup command", () => {
  it("returns a copyable agent prompt before setup starts", async () => {
    const text = textOf(await setupCommand.handler(fakeCtx));
    expect(text).toContain("setup has not started");
    expect(text).toContain("Call the agent tool `politiclaw_configure`");
    expect(text).toContain("street address");
  });

  it("uses the checkpoint for mid-flow setup", async () => {
    setOnboardingCheckpoint(kv, {
      stage: "issues",
      reason: "setup_progress",
      lastPromptSummary: "choose issues",
    });

    const text = textOf(await setupCommand.handler(fakeCtx));
    expect(text).toContain("setup is in progress");
    expect(text).toContain("issue stances");
    expect(text).toContain("`politiclaw_configure` with `{}`");
  });

  it("points complete setup toward status and follow-ups", async () => {
    upsertPreferences(db, {
      address: "123 Main",
      zip: "94110",
      state: "CA",
      monitoringMode: "weekly_digest",
    });
    upsertIssueStance(db, { issue: "housing", stance: "support", weight: 3 });

    const text = textOf(await setupCommand.handler(fakeCtx));
    expect(text).toContain("setup looks complete");
    expect(text).toContain("/politiclaw-status");
    expect(text).toContain("politiclaw_issue_stances");
  });
});
