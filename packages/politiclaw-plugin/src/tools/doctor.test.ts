import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { openMemoryDb, type PolitiClawDb } from "../storage/sqlite.js";
import { Kv } from "../storage/kv.js";
import {
  configureStorage,
  resetStorageConfigForTests,
  setPluginConfigForTests,
  setStorageForTests,
} from "../storage/context.js";
import {
  resetGatewayCronAdapterForTests,
  setGatewayCronAdapterForTests,
  type GatewayCronAdapter,
} from "../cron/gatewayAdapter.js";
import { upsertPreferences } from "../domain/preferences/index.js";
import { doctorTool } from "./doctor.js";

function withMemoryStorage(): PolitiClawDb {
  const db = openMemoryDb();
  configureStorage(() => "/tmp/politiclaw-tests");
  setStorageForTests({ db, kv: new Kv(db) });
  return db;
}

function textOf(result: { content: Array<{ type: string; text?: string }> }): string {
  const first = result.content[0] as { type: "text"; text: string };
  return first.text;
}

const emptyAdapter: GatewayCronAdapter = {
  async list() {
    return [];
  },
  async add() {
    throw new Error("not implemented in test");
  },
  async update() {
    throw new Error("not implemented in test");
  },
};

let db: PolitiClawDb;
beforeEach(() => {
  db = withMemoryStorage();
  setPluginConfigForTests({ apiKeys: {} });
  setGatewayCronAdapterForTests(emptyAdapter);
});
afterEach(() => {
  resetStorageConfigForTests();
  resetGatewayCronAdapterForTests();
});

describe("politiclaw_doctor tool", () => {
  it("renders a fail header and per-check markers on a bare install", async () => {
    const result = await doctorTool.execute!("call-1", {}, undefined, undefined);
    const text = textOf(result);
    expect(text).toContain("PolitiClaw doctor:");
    expect(text).toContain("[fail]");
    expect(text).toContain("[warn]");
    expect(text).toContain("API keys");
    expect(text).toContain("politiclaw_configure");
  });

  it("renders an all-green header when everything is healthy", async () => {
    upsertPreferences(db, { address: "123 Main", zip: "94110", state: "CA" });
    db.prepare(
      `INSERT INTO reps (id, name, office, party, jurisdiction, district, state, contact,
                         last_synced, source_adapter_id, source_tier, raw)
       VALUES ('P1', 'Rep One', 'US House', 'D', 'US-CA', '11', 'CA', NULL,
               @synced, 'geocodio', 2, '{}')`,
    ).run({ synced: Date.now() });
    setPluginConfigForTests({
      apiKeys: {
        apiDataGov: "k",
        geocodio: "k",
        googleCivic: "k",
        openStates: "k",
        voteSmart: "k",
      },
    });
    setGatewayCronAdapterForTests({
      async list() {
        return [
          {
            id: "c1",
            name: "politiclaw.weekly_summary",
            enabled: true,
            schedule: { kind: "every", everyMs: 60_000 },
            sessionTarget: "isolated",
            wakeMode: "next-heartbeat",
            payload: { kind: "agentTurn", message: "ok" },
          },
        ];
      },
      async add() {
        throw new Error("unused");
      },
      async update() {
        throw new Error("unused");
      },
    });

    const result = await doctorTool.execute!("call-1", {}, undefined, undefined);
    const text = textOf(result);
    expect(text).toContain("all");
    expect(text).toContain("green");
    expect(text).not.toContain("[fail]");
    expect(text).not.toContain("[warn]");
  });

  it("returns an error result when storage is unconfigured", async () => {
    resetStorageConfigForTests();
    const result = await doctorTool.execute!("call-1", {}, undefined, undefined);
    const text = textOf(result);
    expect(text).toContain("Doctor run failed");
  });
});
