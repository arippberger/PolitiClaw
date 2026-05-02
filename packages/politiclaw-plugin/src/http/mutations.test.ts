import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  resetGatewayCronAdapterForTests,
  setGatewayCronAdapterForTests,
  type CronAddInput,
  type CronUpdatePatch,
  type GatewayCronAdapter,
  type GatewayCronJob,
} from "../cron/gatewayAdapter.js";
import { setupMonitoring } from "../cron/setup.js";
import { upsertPreferences } from "../domain/preferences/index.js";
import { openMemoryDb, type PolitiClawDb } from "../storage/sqlite.js";

import {
  handleLetterRedraft,
  handleMonitoringToggle,
  handlePreferencesUpdate,
  handleStanceSignalCreate,
} from "./mutations.js";

function createInMemoryAdapter(): {
  adapter: GatewayCronAdapter;
  jobs: GatewayCronJob[];
} {
  const jobs: GatewayCronJob[] = [];
  let nextId = 1;
  const adapter: GatewayCronAdapter = {
    async list() {
      return jobs.map((job) => ({ ...job }));
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
      jobs.push(created);
      return { ...created };
    },
    async update(id: string, patch: CronUpdatePatch) {
      const idx = jobs.findIndex((j) => j.id === id);
      if (idx < 0) throw new Error(`no job with id ${id}`);
      const current = jobs[idx]!;
      const next: GatewayCronJob = {
        ...current,
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
      };
      jobs[idx] = next;
      return { ...next };
    },
  };
  return { adapter, jobs };
}

function seedLetter(db: PolitiClawDb, subject: string): number {
  const result = db
    .prepare(
      `INSERT INTO letters (rep_id, rep_name, rep_office, issue, bill_id, subject, body,
                            citations_json, stance_snapshot_hash, word_count, created_at)
       VALUES ('B000001', 'Rep One', 'US House', 'housing', NULL, @subject, 'body',
               '[]', 'hash', 42, @now)`,
    )
    .run({ subject, now: Date.now() });
  return Number(result.lastInsertRowid);
}

afterEach(() => {
  resetGatewayCronAdapterForTests();
});

describe("handlePreferencesUpdate", () => {
  it("upserts preferences on the happy path", () => {
    const db = openMemoryDb();
    const result = handlePreferencesUpdate(db, {
      address: "742 Evergreen Terrace",
      zip: "90001",
      state: "CA",
      district: "12",
      monitoringMode: "weekly_digest",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.status).toBe(200);
    const body = result.body as {
      preferences: { address: string; monitoringMode: string };
    };
    expect(body.preferences.address).toBe("742 Evergreen Terrace");
    expect(body.preferences.monitoringMode).toBe("weekly_digest");
  });

  it("returns 400 when the body fails validation", () => {
    const db = openMemoryDb();
    const result = handlePreferencesUpdate(db, {
      monitoringMode: "invalid-mode",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(400);
    expect((result.body as { error: string }).error).toBe("invalid_body");
  });

  it("returns 400 when no editable fields are provided", () => {
    const db = openMemoryDb();
    const result = handlePreferencesUpdate(db, {});
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(400);
    expect((result.body as { error: string }).error).toBe("empty_update");
  });

  it("returns 409 when mode-only update runs without an address on file", () => {
    const db = openMemoryDb();
    const result = handlePreferencesUpdate(db, { monitoringMode: "off" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(409);
    expect((result.body as { error: string }).error).toBe("no_address_on_file");
  });

  it("mode-only update succeeds when preferences already exist", () => {
    const db = openMemoryDb();
    upsertPreferences(db, { address: "742 Evergreen", state: "CA" });
    const result = handlePreferencesUpdate(db, { monitoringMode: "off" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const body = result.body as { monitoringMode: string };
    expect(body.monitoringMode).toBe("off");
  });

  it("upserts issue stances and returns them", () => {
    const db = openMemoryDb();
    const result = handlePreferencesUpdate(db, {
      issueStances: [
        { issue: "housing", stance: "support", weight: 4 },
        { issue: "climate", stance: "oppose" },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const body = result.body as {
      upsertedIssueStances: { issue: string; weight: number }[];
    };
    expect(body.upsertedIssueStances).toHaveLength(2);
    expect(body.upsertedIssueStances[0]!.issue).toBe("housing");
    expect(body.upsertedIssueStances[0]!.weight).toBe(4);
    expect(body.upsertedIssueStances[1]!.weight).toBe(3);
  });
});

describe("handleMonitoringToggle", () => {
  beforeEach(() => {
    resetGatewayCronAdapterForTests();
  });

  it("pauses every PolitiClaw job when enabled=false", async () => {
    const { adapter, jobs } = createInMemoryAdapter();
    setGatewayCronAdapterForTests(adapter);
    await setupMonitoring({ mode: "full_copilot" });

    const result = await handleMonitoringToggle({ enabled: false });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.status).toBe(200);
    const body = result.body as { outcomes: { action: string }[] };
    expect(body.outcomes.every((o) => o.action === "paused")).toBe(true);
    for (const job of jobs) {
      expect(job.enabled).toBe(false);
    }
  });

  it("resumes every PolitiClaw job when enabled=true", async () => {
    const { adapter, jobs } = createInMemoryAdapter();
    setGatewayCronAdapterForTests(adapter);
    await setupMonitoring({ mode: "full_copilot" });
    await handleMonitoringToggle({ enabled: false });

    const result = await handleMonitoringToggle({ enabled: true });
    expect(result.ok).toBe(true);
    for (const job of jobs) {
      expect(job.enabled).toBe(true);
    }
  });

  it("returns 400 when the body is not {enabled: boolean}", async () => {
    const result = await handleMonitoringToggle({ enabled: "nope" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(400);
    expect((result.body as { error: string }).error).toBe("invalid_body");
  });
});

describe("handleStanceSignalCreate", () => {
  it("records a stance signal with source forced to 'dashboard'", () => {
    const db = openMemoryDb();
    const result = handleStanceSignalCreate(db, {
      billId: "119-hr-1",
      direction: "agree",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.status).toBe(200);
    const body = result.body as { id: number; billId: string; direction: string };
    expect(body.billId).toBe("119-hr-1");
    expect(body.direction).toBe("agree");
    expect(body.id).toBeGreaterThan(0);

    const row = db
      .prepare("SELECT source, direction FROM stance_signals WHERE id = ?")
      .get(body.id) as { source: string; direction: string };
    expect(row.source).toBe("dashboard");
    expect(row.direction).toBe("agree");
  });

  it("rejects a body without a billId", () => {
    const db = openMemoryDb();
    const result = handleStanceSignalCreate(db, { direction: "skip" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(400);
    expect((result.body as { error: string }).error).toBe("invalid_body");
  });

  it("rejects an invalid direction", () => {
    const db = openMemoryDb();
    const result = handleStanceSignalCreate(db, {
      billId: "119-hr-1",
      direction: "undecided",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(400);
  });
});

describe("handleLetterRedraft", () => {
  it("stamps redraft_requested_at on the happy path", () => {
    const db = openMemoryDb();
    const letterId = seedLetter(db, "Constituent position");

    const result = handleLetterRedraft(db, letterId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const body = result.body as { status: string; redraftRequestedAt: number };
    expect(body.status).toBe("ok");
    expect(body.redraftRequestedAt).toBeGreaterThan(0);

    const row = db
      .prepare("SELECT redraft_requested_at FROM letters WHERE id = ?")
      .get(letterId) as { redraft_requested_at: number };
    expect(row.redraft_requested_at).toBe(body.redraftRequestedAt);
  });

  it("returns 404 when the letter id is not found", () => {
    const db = openMemoryDb();
    const result = handleLetterRedraft(db, 9999);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(404);
    expect((result.body as { error: string }).error).toBe("letter_not_found");
  });

  it("returns 400 for a non-positive id", () => {
    const db = openMemoryDb();
    const result = handleLetterRedraft(db, 0);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(400);
    expect((result.body as { error: string }).error).toBe("invalid_letter_id");
  });
});
