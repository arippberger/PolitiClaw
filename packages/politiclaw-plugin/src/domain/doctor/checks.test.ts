import { describe, expect, it } from "vitest";

import { openMemoryDb, type PolitiClawDb } from "../../storage/sqlite.js";
import type {
  CronAddInput,
  CronUpdatePatch,
  GatewayCronAdapter,
  GatewayCronJob,
} from "../../cron/gatewayAdapter.js";
import { POLITICLAW_CRON_NAMES } from "../../cron/templates.js";
import { upsertPreferences } from "../preferences/index.js";
import { runDoctor } from "./checks.js";

function seedRep(db: PolitiClawDb): void {
  db.prepare(
    `INSERT INTO reps (id, name, office, party, jurisdiction, district, state, contact,
                       last_synced, source_adapter_id, source_tier, raw)
     VALUES ('P1', 'Rep One', 'US House', 'D', 'US-CA', '11', 'CA', NULL,
             @synced, 'geocodio', 2, '{}')`,
  ).run({ synced: Date.now() });
}

function makeCronAdapter(jobs: GatewayCronJob[]): GatewayCronAdapter {
  let nextId = jobs.length + 1;
  const state = jobs.map((job) => ({ ...job }));
  return {
    async list() {
      return state.map((job) => ({ ...job }));
    },
    async add(job: CronAddInput) {
      const created: GatewayCronJob = {
        id: `cron_${nextId++}`,
        name: job.name,
        description: job.description,
        enabled: job.enabled ?? true,
        schedule: job.schedule,
        sessionTarget: job.sessionTarget,
        wakeMode: job.wakeMode,
        payload: job.payload,
        delivery: job.delivery,
      };
      state.push(created);
      return { ...created };
    },
    async update(id: string, patch: CronUpdatePatch) {
      const idx = state.findIndex((j) => j.id === id);
      if (idx < 0) throw new Error(`no job ${id}`);
      state[idx] = { ...state[idx]!, ...patch } as GatewayCronJob;
      return { ...state[idx]! };
    },
  };
}

function jobNamed(name: string, enabled: boolean): GatewayCronJob {
  return {
    id: `cron_${name}`,
    name,
    enabled,
    schedule: { kind: "every", everyMs: 60_000 },
    sessionTarget: "isolated",
    wakeMode: "next-heartbeat",
    payload: { kind: "agentTurn", message: "test" },
  };
}

describe("runDoctor", () => {
  it("flags missing preferences and missing required key as separate findings", async () => {
    const db = openMemoryDb();
    const report = await runDoctor({
      db,
      config: { apiKeys: {} },
      cronAdapter: makeCronAdapter([]),
    });
    const byId = Object.fromEntries(report.checks.map((c) => [c.id, c]));
    expect(byId.schema_version?.status).toBe("ok");
    expect(byId.db_integrity?.status).toBe("ok");
    expect(byId.preferences?.status).toBe("warn");
    expect(byId.preferences?.actionable).toContain("politiclaw_configure");
    expect(byId.api_keys?.status).toBe("fail");
    expect(byId.api_keys?.summary).toContain("api.data.gov");
    expect(byId.reps_cache?.status).toBe("warn");
    expect(byId.cron_jobs?.status).toBe("warn");
    expect(report.worst).toBe("fail");
  });

  it("returns all green when prefs, key, reps cache, and cron are all healthy", async () => {
    const db = openMemoryDb();
    upsertPreferences(db, { address: "123 Main", zip: "94110", state: "CA" });
    seedRep(db);
    const adapter = makeCronAdapter(
      POLITICLAW_CRON_NAMES.map((name) => jobNamed(name, true)),
    );
    const report = await runDoctor({
      db,
      config: {
        apiKeys: {
          apiDataGov: "key",
          geocodio: "key",
          googleCivic: "key",
          openStates: "key",
          voteSmart: "key",
        },
      },
      cronAdapter: adapter,
    });
    expect(report.worst).toBe("ok");
    for (const check of report.checks) {
      expect(check.status).toBe("ok");
    }
  });

  it("warns on optional keys missing but passes required check", async () => {
    const db = openMemoryDb();
    upsertPreferences(db, { address: "123 Main", zip: "94110", state: "CA" });
    const report = await runDoctor({
      db,
      config: { apiKeys: { apiDataGov: "key" } },
      cronAdapter: makeCronAdapter([]),
    });
    const byId = Object.fromEntries(report.checks.map((c) => [c.id, c]));
    expect(byId.api_keys?.status).toBe("warn");
    expect(byId.api_keys?.summary).toContain("Geocodio");
    expect(byId.api_keys?.summary).not.toContain("api.data.gov");
  });

  it("flags preferences with missing state as warn", async () => {
    const db = openMemoryDb();
    upsertPreferences(db, { address: "123 Main" });
    const report = await runDoctor({
      db,
      config: { apiKeys: { apiDataGov: "key" } },
      cronAdapter: makeCronAdapter([]),
    });
    const prefs = report.checks.find((c) => c.id === "preferences")!;
    expect(prefs.status).toBe("warn");
    expect(prefs.summary).toContain("state");
  });

  it("warns when all cron jobs are installed but paused", async () => {
    const db = openMemoryDb();
    upsertPreferences(db, { address: "123 Main", zip: "94110", state: "CA" });
    const adapter = makeCronAdapter(
      POLITICLAW_CRON_NAMES.map((name) => jobNamed(name, false)),
    );
    const report = await runDoctor({
      db,
      config: { apiKeys: { apiDataGov: "key" } },
      cronAdapter: adapter,
    });
    const cron = report.checks.find((c) => c.id === "cron_jobs")!;
    expect(cron.status).toBe("warn");
    expect(cron.summary).toContain("paused");
    expect(cron.actionable).toContain("politiclaw_configure");
  });

  it("reports ok when some cron jobs are disabled by cadence but at least one is active", async () => {
    const db = openMemoryDb();
    upsertPreferences(db, { address: "123 Main", zip: "94110", state: "CA" });
    const adapter = makeCronAdapter([
      jobNamed(POLITICLAW_CRON_NAMES[0]!, true),
      jobNamed(POLITICLAW_CRON_NAMES[1]!, false),
    ]);
    const report = await runDoctor({
      db,
      config: { apiKeys: { apiDataGov: "key" } },
      cronAdapter: adapter,
    });
    const cron = report.checks.find((c) => c.id === "cron_jobs")!;
    expect(cron.status).toBe("ok");
    expect(cron.summary).toContain("1 of 2");
  });

  it("warns (not fails) when no cron adapter is supplied", async () => {
    const db = openMemoryDb();
    upsertPreferences(db, { address: "123 Main", zip: "94110", state: "CA" });
    const report = await runDoctor({
      db,
      config: { apiKeys: { apiDataGov: "key" } },
    });
    const cron = report.checks.find((c) => c.id === "cron_jobs")!;
    expect(cron.status).toBe("warn");
    expect(cron.summary).toContain("not available");
  });

  it("surfaces cron adapter errors as a failing check without throwing", async () => {
    const db = openMemoryDb();
    upsertPreferences(db, { address: "123 Main", zip: "94110", state: "CA" });
    const brokenAdapter: GatewayCronAdapter = {
      async list() {
        throw new Error("gateway down");
      },
      async add() {
        throw new Error("unused");
      },
      async update() {
        throw new Error("unused");
      },
    };
    const report = await runDoctor({
      db,
      config: { apiKeys: { apiDataGov: "key" } },
      cronAdapter: brokenAdapter,
    });
    const cron = report.checks.find((c) => c.id === "cron_jobs")!;
    expect(cron.status).toBe("fail");
    expect(cron.summary).toContain("gateway down");
  });

  it("stamps a generatedAtMs from the injected clock", async () => {
    const db = openMemoryDb();
    const report = await runDoctor({
      db,
      config: { apiKeys: {} },
      now: () => 1_700_000_000_000,
    });
    expect(report.generatedAtMs).toBe(1_700_000_000_000);
  });
});
