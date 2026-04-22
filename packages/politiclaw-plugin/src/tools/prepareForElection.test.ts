import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Kv } from "../storage/kv.js";
import {
  resetStorageConfigForTests,
  setPluginConfigForTests,
  setStorageForTests,
} from "../storage/context.js";
import { openMemoryDb } from "../storage/sqlite.js";
import {
  upsertIssueStance,
  upsertPreferences,
} from "../domain/preferences/index.js";
import { prepareForElectionTool, renderPrepareForElectionOutput } from "./prepareForElection.js";
import type { PrepareForElectionResult } from "../domain/ballot/prepareForElection.js";

function textFrom(result: { content?: Array<{ type: string; text?: string }> }): string {
  const block = result.content?.[0];
  if (!block || block.type !== "text" || !block.text) {
    throw new Error("expected text content");
  }
  return block.text;
}

describe("renderPrepareForElectionOutput", () => {
  it("renders setup_needed with pointers to the exact tool per missing item", () => {
    const result: PrepareForElectionResult = {
      status: "setup_needed",
      missing: [
        {
          id: "preferences",
          reason: "no saved address",
          actionable: "call politiclaw_configure",
        },
        {
          id: "stances",
          reason: "no declared issue stances",
          actionable: "call politiclaw_configure",
        },
      ],
    };
    const text = renderPrepareForElectionOutput(result);
    expect(text).toContain("Setup needed");
    expect(text).toContain("politiclaw_configure");
  });

  it("renders ballot_unavailable with the adapter hint", () => {
    const result: PrepareForElectionResult = {
      status: "ballot_unavailable",
      reason: "googleCivic is not configured",
      actionable: "set plugins.politiclaw.apiKeys.googleCivic",
      adapterId: "googleCivic",
    };
    const text = renderPrepareForElectionOutput(result);
    expect(text).toContain("Ballot data unavailable");
    expect(text).toContain("googleCivic");
    expect(text).toContain("set plugins.politiclaw.apiKeys.googleCivic");
  });
});

describe("politiclaw_prepare_me_for_my_next_election — execute", () => {
  beforeEach(() => {
    resetStorageConfigForTests();
  });
  afterEach(() => {
    resetStorageConfigForTests();
  });

  it("returns setup_needed with the preferences pointer when no address is saved", async () => {
    const db = openMemoryDb();
    setStorageForTests({ db, kv: new Kv(db) });
    setPluginConfigForTests({ apiKeys: { googleCivic: "fake" } });

    const res = await prepareForElectionTool.execute!("call-1", {}, undefined, undefined);
    const text = textFrom(res as { content: Array<{ type: string; text: string }> });
    expect(text).toContain("Setup needed");
    expect(text).toContain("politiclaw_configure");
  });

  it("returns setup_needed with the stances pointer when stances are missing", async () => {
    const db = openMemoryDb();
    upsertPreferences(db, { address: "123 Main St", state: "CA" });
    // seed a rep row directly so the stance prereq is the only failure
    db.prepare(
      `INSERT INTO reps (id, name, office, party, state, district, contact, last_synced, source_adapter_id, source_tier)
       VALUES ('rep-1', 'Test Rep', 'US House', 'X', 'CA', '12', '{}', @now, 'fake', 1)`,
    ).run({ now: Date.now() });
    setStorageForTests({ db, kv: new Kv(db) });
    setPluginConfigForTests({ apiKeys: { googleCivic: "fake" } });

    const res = await prepareForElectionTool.execute!("call-1", {}, undefined, undefined);
    const text = textFrom(res as { content: Array<{ type: string; text: string }> });
    expect(text).toContain("Setup needed");
    expect(text).toContain("politiclaw_configure");
  });

  it("returns ballot_unavailable when googleCivic is absent but all prereqs are met", async () => {
    const db = openMemoryDb();
    upsertPreferences(db, { address: "123 Main St", state: "CA" });
    db.prepare(
      `INSERT INTO reps (id, name, office, party, state, district, contact, last_synced, source_adapter_id, source_tier)
       VALUES ('rep-1', 'Test Rep', 'US House', 'X', 'CA', '12', '{}', @now, 'fake', 1)`,
    ).run({ now: Date.now() });
    upsertIssueStance(db, { issue: "housing", stance: "support", weight: 3 });
    setStorageForTests({ db, kv: new Kv(db) });
    setPluginConfigForTests({ apiKeys: {} });

    const res = await prepareForElectionTool.execute!("call-1", {}, undefined, undefined);
    const text = textFrom(res as { content: Array<{ type: string; text: string }> });
    expect(text).toContain("Ballot data unavailable");
    expect(text).toContain("googleCivic");
  });
});
