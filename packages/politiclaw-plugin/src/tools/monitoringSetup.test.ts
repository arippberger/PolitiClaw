import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  resetGatewayCronAdapterForTests,
  setGatewayCronAdapterForTests,
  type GatewayCronAdapter,
  type GatewayCronJob,
} from "../cron/gatewayAdapter.js";
import {
  POLITICLAW_CRON_NAMES,
  POLITICLAW_CRON_TEMPLATES,
} from "../cron/templates.js";
import { setMonitoringCadence, upsertPreferences } from "../domain/preferences/index.js";
import { Kv } from "../storage/kv.js";
import {
  resetStorageConfigForTests,
  setStorageForTests,
} from "../storage/context.js";
import { openMemoryDb } from "../storage/sqlite.js";
import {
  pauseMonitoringTool,
  resumeMonitoringTool,
  setupMonitoringTool,
} from "./monitoringSetup.js";

function seedStorageWithCadence(
  cadence: "off" | "election_proximity" | "weekly" | "both",
): void {
  const db = openMemoryDb();
  upsertPreferences(db, { address: "123 Main", state: "CA" });
  setMonitoringCadence(db, cadence);
  setStorageForTests({ db, kv: new Kv(db) });
}

function extractText(content: unknown): string {
  const arr = (content as Array<{ type: string; text: string }>) ?? [];
  const first = arr[0];
  return first && first.type === "text" ? first.text : "";
}

/** Trivial in-memory gateway; see src/cron/setup.test.ts for the same pattern. */
function buildAdapter(initial: GatewayCronJob[] = []): {
  adapter: GatewayCronAdapter;
  jobs: GatewayCronJob[];
} {
  const jobs: GatewayCronJob[] = initial.map((job) => ({ ...job }));
  let nextId = initial.length + 1;
  const adapter: GatewayCronAdapter = {
    async list() {
      return jobs.map((job) => ({ ...job }));
    },
    async add(job) {
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
    async update(id, patch) {
      const index = jobs.findIndex((job) => job.id === id);
      if (index < 0) throw new Error(`no job ${id}`);
      const current = jobs[index]!;
      const next: GatewayCronJob = {
        ...current,
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
        ...(patch.description !== undefined
          ? { description: patch.description }
          : {}),
        ...(patch.schedule !== undefined ? { schedule: patch.schedule } : {}),
        ...(patch.sessionTarget !== undefined
          ? { sessionTarget: patch.sessionTarget }
          : {}),
        ...(patch.wakeMode !== undefined ? { wakeMode: patch.wakeMode } : {}),
        ...(patch.payload !== undefined ? { payload: patch.payload } : {}),
        ...(patch.delivery !== undefined ? { delivery: patch.delivery } : {}),
      };
      jobs[index] = next;
      return { ...next };
    },
  };
  return { adapter, jobs };
}

afterEach(() => {
  resetGatewayCronAdapterForTests();
  resetStorageConfigForTests();
});

describe("politiclaw_setup_monitoring tool", () => {
  beforeEach(() => {
    resetGatewayCronAdapterForTests();
    resetStorageConfigForTests();
  });

  it("reports 'installed' for every template on first run with cadence 'both'", async () => {
    seedStorageWithCadence("both");
    const { adapter } = buildAdapter();
    setGatewayCronAdapterForTests(adapter);

    const result = await setupMonitoringTool.execute!(
      "call-1",
      {},
      undefined,
      undefined,
    );
    const text = extractText(result.content);

    expect(text).toContain("PolitiClaw monitoring jobs installed for cadence 'both':");
    for (const name of POLITICLAW_CRON_NAMES) {
      expect(text).toContain(`${name}: installed`);
    }
  });

  it("installs only the election_proximity subset when cadence defaults", async () => {
    seedStorageWithCadence("election_proximity");
    const { adapter } = buildAdapter();
    setGatewayCronAdapterForTests(adapter);

    const result = await setupMonitoringTool.execute!(
      "call-1",
      {},
      undefined,
      undefined,
    );
    const text = extractText(result.content);

    expect(text).toContain("'election_proximity'");
    expect(text).toContain("politiclaw.rep_vote_watch: installed");
    expect(text).toContain("politiclaw.tracked_hearings: installed");
    expect(text).toContain("politiclaw.election_proximity_alert: installed");
    expect(text).toContain("politiclaw.weekly_summary: not installed");
    expect(text).toContain("politiclaw.rep_report: not installed");
  });

  it("reports 'already live' on an idempotent second run", async () => {
    seedStorageWithCadence("both");
    const { adapter } = buildAdapter();
    setGatewayCronAdapterForTests(adapter);

    await setupMonitoringTool.execute!("call-1", {}, undefined, undefined);
    const again = await setupMonitoringTool.execute!(
      "call-2",
      {},
      undefined,
      undefined,
    );
    const text = extractText(again.content);

    expect(text).toContain("match cadence 'both'. No change.");
    expect(text).not.toContain(": installed (");
  });

  it("surfaces gateway errors without crashing the tool", async () => {
    seedStorageWithCadence("both");
    const adapter: GatewayCronAdapter = {
      async list() {
        throw new Error("gateway unreachable: ECONNREFUSED");
      },
      async add() {
        throw new Error("should not reach add");
      },
      async update() {
        throw new Error("should not reach update");
      },
    };
    setGatewayCronAdapterForTests(adapter);

    const result = await setupMonitoringTool.execute!(
      "call-1",
      {},
      undefined,
      undefined,
    );
    const text = extractText(result.content);
    expect(text).toContain("Monitoring setup failed");
    expect(text).toContain("ECONNREFUSED");
    expect(text).toContain("cron scope");
  });
});

describe("politiclaw_pause_monitoring / politiclaw_resume_monitoring tools", () => {
  beforeEach(() => {
    resetGatewayCronAdapterForTests();
    resetStorageConfigForTests();
  });

  it("renders 'not installed' hint when pausing before setup", async () => {
    const { adapter } = buildAdapter();
    setGatewayCronAdapterForTests(adapter);

    const result = await pauseMonitoringTool.execute!(
      "call-1",
      {},
      undefined,
      undefined,
    );
    const text = extractText(result.content);
    expect(text).toContain("No PolitiClaw monitoring jobs to toggle");
    expect(text).toContain("run politiclaw_setup_monitoring first");
  });

  it("pauses then resumes an installed set with the expected markers", async () => {
    seedStorageWithCadence("both");
    const { adapter } = buildAdapter();
    setGatewayCronAdapterForTests(adapter);

    await setupMonitoringTool.execute!("call-setup", {}, undefined, undefined);

    const paused = await pauseMonitoringTool.execute!(
      "call-pause",
      {},
      undefined,
      undefined,
    );
    const pauseText = extractText(paused.content);
    expect(pauseText).toContain("PolitiClaw monitoring paused:");
    for (const template of POLITICLAW_CRON_TEMPLATES) {
      expect(pauseText).toContain(`${template.name}: paused`);
    }

    const resumed = await resumeMonitoringTool.execute!(
      "call-resume",
      {},
      undefined,
      undefined,
    );
    const resumeText = extractText(resumed.content);
    expect(resumeText).toContain("PolitiClaw monitoring resumed:");
    for (const template of POLITICLAW_CRON_TEMPLATES) {
      expect(resumeText).toContain(`${template.name}: resumed`);
    }
  });

  it("reports 'already paused' when pausing a fully-paused set", async () => {
    seedStorageWithCadence("both");
    const { adapter } = buildAdapter();
    setGatewayCronAdapterForTests(adapter);

    await setupMonitoringTool.execute!("call-setup", {}, undefined, undefined);
    await pauseMonitoringTool.execute!("call-pause", {}, undefined, undefined);

    const second = await pauseMonitoringTool.execute!(
      "call-pause-again",
      {},
      undefined,
      undefined,
    );
    const text = extractText(second.content);
    expect(text).toContain("PolitiClaw monitoring already paused.");
    for (const template of POLITICLAW_CRON_TEMPLATES) {
      expect(text).toContain(`${template.name}: already paused`);
    }
  });
});
