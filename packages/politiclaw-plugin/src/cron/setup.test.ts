import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  resetGatewayCronAdapterForTests,
  setGatewayCronAdapterForTests,
  type CronAddInput,
  type CronUpdatePatch,
  type GatewayCronAdapter,
  type GatewayCronJob,
} from "./gatewayAdapter.js";
import {
  pauseMonitoring,
  resumeMonitoring,
  setupMonitoring,
} from "./setup.js";
import {
  ELECTION_PROXIMITY_ALERT_TEMPLATE,
  POLITICLAW_CRON_NAMES,
  POLITICLAW_CRON_TEMPLATES,
  REP_REPORT_TEMPLATE,
  REP_VOTE_WATCH_TEMPLATE,
  TRACKED_HEARINGS_TEMPLATE,
  templatesForCadence,
  WEEKLY_SUMMARY_TEMPLATE,
  type MonitoringCadence,
} from "./templates.js";

/**
 * In-memory gateway cron service. Mirrors the production gateway enough to
 * exercise setup / pause / resume without opening a real websocket. Records
 * the calls it saw so individual tests can assert call shape, not just
 * end-state.
 */
function createInMemoryAdapter(initialJobs: GatewayCronJob[] = []): {
  adapter: GatewayCronAdapter;
  jobs: GatewayCronJob[];
  calls: Array<
    | { method: "list"; args: { includeDisabled?: boolean } | undefined }
    | { method: "add"; args: CronAddInput }
    | { method: "update"; args: { id: string; patch: CronUpdatePatch } }
  >;
} {
  const jobs: GatewayCronJob[] = initialJobs.map((job) => ({ ...job }));
  const calls: Array<
    | { method: "list"; args: { includeDisabled?: boolean } | undefined }
    | { method: "add"; args: CronAddInput }
    | { method: "update"; args: { id: string; patch: CronUpdatePatch } }
  > = [];
  let nextId = initialJobs.length + 1;

  const adapter: GatewayCronAdapter = {
    async list(opts) {
      calls.push({ method: "list", args: opts });
      return jobs.map((job) => ({ ...job }));
    },
    async add(job) {
      calls.push({ method: "add", args: job });
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
      calls.push({ method: "update", args: { id, patch } });
      const index = jobs.findIndex((job) => job.id === id);
      if (index < 0) throw new Error(`no job with id ${id}`);
      const current = jobs[index]!;
      const next: GatewayCronJob = {
        ...current,
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.description !== undefined
          ? { description: patch.description }
          : {}),
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
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
  return { adapter, jobs, calls };
}

function cloneJobFromTemplate(
  template: (typeof POLITICLAW_CRON_TEMPLATES)[number],
  overrides: Partial<GatewayCronJob> = {},
): GatewayCronJob {
  return {
    id: overrides.id ?? "cron_existing",
    name: template.name,
    description: template.description,
    enabled: true,
    schedule: template.schedule,
    sessionTarget: template.sessionTarget,
    wakeMode: template.wakeMode,
    payload: template.payload,
    delivery: template.delivery,
    ...overrides,
  };
}

afterEach(() => {
  resetGatewayCronAdapterForTests();
  vi.restoreAllMocks();
});

describe("cron/templates", () => {
  it("declares every template with namespaced names", () => {
    expect(POLITICLAW_CRON_TEMPLATES).toHaveLength(5);
    for (const template of POLITICLAW_CRON_TEMPLATES) {
      expect(template.name.startsWith("politiclaw.")).toBe(true);
      expect(template.payload.kind).toBe("agentTurn");
      expect(template.delivery.mode).toBe("announce");
      expect(template.sessionTarget).toBe("isolated");
    }
    expect(POLITICLAW_CRON_NAMES).toEqual([
      "politiclaw.weekly_summary",
      "politiclaw.rep_vote_watch",
      "politiclaw.tracked_hearings",
      "politiclaw.rep_report",
      "politiclaw.election_proximity_alert",
    ]);
  });

  it("uses distinct schedule intervals", () => {
    const weeklyMs =
      WEEKLY_SUMMARY_TEMPLATE.schedule.kind === "every"
        ? WEEKLY_SUMMARY_TEMPLATE.schedule.everyMs
        : 0;
    const repMs =
      REP_VOTE_WATCH_TEMPLATE.schedule.kind === "every"
        ? REP_VOTE_WATCH_TEMPLATE.schedule.everyMs
        : 0;
    const hearingMs =
      TRACKED_HEARINGS_TEMPLATE.schedule.kind === "every"
        ? TRACKED_HEARINGS_TEMPLATE.schedule.everyMs
        : 0;
    const reportMs =
      REP_REPORT_TEMPLATE.schedule.kind === "every" ? REP_REPORT_TEMPLATE.schedule.everyMs : 0;
    const proximityMs =
      ELECTION_PROXIMITY_ALERT_TEMPLATE.schedule.kind === "every"
        ? ELECTION_PROXIMITY_ALERT_TEMPLATE.schedule.everyMs
        : 0;
    expect(weeklyMs).toBe(7 * 24 * 60 * 60 * 1000);
    expect(repMs).toBe(6 * 60 * 60 * 1000);
    expect(hearingMs).toBe(12 * 60 * 60 * 1000);
    expect(reportMs).toBe(30 * 24 * 60 * 60 * 1000);
    expect(proximityMs).toBe(24 * 60 * 60 * 1000);
    expect(new Set([weeklyMs, repMs, hearingMs, reportMs, proximityMs]).size).toBe(5);
  });

  it("maps each cadence to the documented template subset", () => {
    expect(templatesForCadence("off").map((t) => t.name)).toEqual([]);
    expect(templatesForCadence("election_proximity").map((t) => t.name)).toEqual([
      "politiclaw.rep_vote_watch",
      "politiclaw.tracked_hearings",
      "politiclaw.election_proximity_alert",
    ]);
    expect(templatesForCadence("weekly").map((t) => t.name)).toEqual([
      "politiclaw.rep_vote_watch",
      "politiclaw.tracked_hearings",
      "politiclaw.weekly_summary",
      "politiclaw.rep_report",
    ]);
    expect(templatesForCadence("both").map((t) => t.name).sort()).toEqual(
      [...POLITICLAW_CRON_NAMES].sort(),
    );
  });
});

describe("setupMonitoring", () => {
  beforeEach(() => {
    resetGatewayCronAdapterForTests();
  });

  it("creates every default job on a first run with cadence 'both'", async () => {
    const { adapter, jobs, calls } = createInMemoryAdapter();
    setGatewayCronAdapterForTests(adapter);

    const result = await setupMonitoring({ cadence: "both" });

    expect(result.outcomes).toHaveLength(5);
    expect(result.outcomes.map((o) => o.action)).toEqual([
      "created",
      "created",
      "created",
      "created",
      "created",
    ]);
    expect(jobs.map((j) => j.name)).toEqual(POLITICLAW_CRON_NAMES);
    expect(calls.filter((c) => c.method === "add")).toHaveLength(5);
    expect(calls.filter((c) => c.method === "update")).toHaveLength(0);
  });

  it("is idempotent: a second run with matching jobs is all-unchanged", async () => {
    const { adapter } = createInMemoryAdapter();
    setGatewayCronAdapterForTests(adapter);

    await setupMonitoring({ cadence: "both" });
    const again = await setupMonitoring({ cadence: "both" });

    expect(again.outcomes.every((o) => o.action === "unchanged")).toBe(true);
    expect(again.outcomes).toHaveLength(5);
  });

  it("patches an existing job in place when the template drifts", async () => {
    const driftedJob = cloneJobFromTemplate(WEEKLY_SUMMARY_TEMPLATE, {
      id: "cron_weekly_old",
      description: "stale description from an earlier plugin version",
    });
    const { adapter, jobs, calls } = createInMemoryAdapter([driftedJob]);
    setGatewayCronAdapterForTests(adapter);

    const result = await setupMonitoring({ cadence: "both" });

    const weeklyOutcome = result.outcomes.find(
      (o) => o.name === WEEKLY_SUMMARY_TEMPLATE.name,
    );
    expect(weeklyOutcome?.action).toBe("updated");
    expect(weeklyOutcome?.jobId).toBe("cron_weekly_old");
    const updatedWeekly = jobs.find((j) => j.name === WEEKLY_SUMMARY_TEMPLATE.name);
    expect(updatedWeekly?.description).toBe(WEEKLY_SUMMARY_TEMPLATE.description);
    expect(calls.some((c) => c.method === "update")).toBe(true);
  });

  it("re-enables a disabled PolitiClaw job during setup", async () => {
    const disabled = cloneJobFromTemplate(REP_VOTE_WATCH_TEMPLATE, {
      id: "cron_rep_paused",
      enabled: false,
    });
    const { adapter, jobs } = createInMemoryAdapter([disabled]);
    setGatewayCronAdapterForTests(adapter);

    const result = await setupMonitoring({ cadence: "both" });

    const repOutcome = result.outcomes.find(
      (o) => o.name === REP_VOTE_WATCH_TEMPLATE.name,
    );
    expect(repOutcome?.action).toBe("updated");
    expect(jobs.find((j) => j.id === "cron_rep_paused")?.enabled).toBe(true);
  });

  it("does not touch non-politiclaw jobs already in the gateway", async () => {
    const unrelated: GatewayCronJob = {
      id: "cron_unrelated",
      name: "user.daily_brief",
      enabled: true,
      schedule: { kind: "every", everyMs: 86_400_000 },
      sessionTarget: "main",
      wakeMode: "next-heartbeat",
      payload: { kind: "agentTurn", message: "user job" },
    };
    const { adapter, jobs } = createInMemoryAdapter([unrelated]);
    setGatewayCronAdapterForTests(adapter);

    await setupMonitoring({ cadence: "both" });

    const preserved = jobs.find((j) => j.id === "cron_unrelated");
    expect(preserved).toBeDefined();
    expect(preserved?.name).toBe("user.daily_brief");
  });

  const cadenceMatrix: Array<{
    cadence: MonitoringCadence;
    installed: string[];
    paused: string[];
  }> = [
    {
      cadence: "off",
      installed: [],
      paused: [...POLITICLAW_CRON_NAMES],
    },
    {
      cadence: "election_proximity",
      installed: [
        "politiclaw.rep_vote_watch",
        "politiclaw.tracked_hearings",
        "politiclaw.election_proximity_alert",
      ],
      paused: ["politiclaw.weekly_summary", "politiclaw.rep_report"],
    },
    {
      cadence: "weekly",
      installed: [
        "politiclaw.rep_vote_watch",
        "politiclaw.tracked_hearings",
        "politiclaw.weekly_summary",
        "politiclaw.rep_report",
      ],
      paused: ["politiclaw.election_proximity_alert"],
    },
    {
      cadence: "both",
      installed: [...POLITICLAW_CRON_NAMES],
      paused: [],
    },
  ];

  for (const row of cadenceMatrix) {
    it(`cadence '${row.cadence}' installs ${row.installed.length} jobs and pauses ${row.paused.length}`, async () => {
      const { adapter, jobs } = createInMemoryAdapter();
      setGatewayCronAdapterForTests(adapter);

      // Start from "everything installed + enabled" so pauses are observable.
      await setupMonitoring({ cadence: "both" });
      const result = await setupMonitoring({ cadence: row.cadence });

      const enabledNames = jobs.filter((j) => j.enabled).map((j) => j.name).sort();
      const disabledNames = jobs.filter((j) => !j.enabled).map((j) => j.name).sort();
      expect(enabledNames).toEqual([...row.installed].sort());
      expect(disabledNames).toEqual([...row.paused].sort());

      // Jobs outside the cadence should render as 'paused' (they were enabled).
      const pausedOutcomes = result.outcomes.filter((o) => o.action === "paused");
      expect(pausedOutcomes.map((o) => o.name).sort()).toEqual(
        [...row.paused].sort(),
      );
    });
  }

  it("renders 'missing' for templates outside the cadence that were never installed", async () => {
    const { adapter } = createInMemoryAdapter();
    setGatewayCronAdapterForTests(adapter);

    const result = await setupMonitoring({ cadence: "election_proximity" });

    const missing = result.outcomes.filter((o) => o.action === "missing");
    expect(missing.map((o) => o.name).sort()).toEqual(
      ["politiclaw.weekly_summary", "politiclaw.rep_report"].sort(),
    );
    expect(missing.every((o) => o.jobId === null)).toBe(true);
  });

  it("defaults to 'election_proximity' when no cadence is provided", async () => {
    const { adapter } = createInMemoryAdapter();
    setGatewayCronAdapterForTests(adapter);

    const result = await setupMonitoring();

    const created = result.outcomes.filter((o) => o.action === "created");
    expect(created.map((o) => o.name).sort()).toEqual(
      [
        "politiclaw.rep_vote_watch",
        "politiclaw.tracked_hearings",
        "politiclaw.election_proximity_alert",
      ].sort(),
    );
  });
});

describe("pauseMonitoring / resumeMonitoring", () => {
  beforeEach(() => {
    resetGatewayCronAdapterForTests();
  });

  it("pauses every PolitiClaw-owned job and leaves others alone", async () => {
    const unrelated: GatewayCronJob = {
      id: "cron_unrelated",
      name: "user.daily_brief",
      enabled: true,
      schedule: { kind: "every", everyMs: 86_400_000 },
      sessionTarget: "main",
      wakeMode: "next-heartbeat",
      payload: { kind: "agentTurn", message: "user job" },
    };
    const { adapter, jobs } = createInMemoryAdapter([unrelated]);
    setGatewayCronAdapterForTests(adapter);

    await setupMonitoring({ cadence: "both" });
    const paused = await pauseMonitoring();

    expect(paused.outcomes).toHaveLength(POLITICLAW_CRON_NAMES.length);
    expect(paused.outcomes.every((o) => o.action === "paused")).toBe(true);
    for (const job of jobs) {
      if (job.name === "user.daily_brief") {
        expect(job.enabled).toBe(true);
      } else {
        expect(job.enabled).toBe(false);
      }
    }
  });

  it("reports 'missing' when nothing is installed yet", async () => {
    const { adapter } = createInMemoryAdapter();
    setGatewayCronAdapterForTests(adapter);

    const paused = await pauseMonitoring();
    expect(paused.outcomes.every((o) => o.action === "missing")).toBe(true);
    expect(paused.outcomes.every((o) => o.jobId === null)).toBe(true);
  });

  it("is idempotent on re-pause and re-resume", async () => {
    const { adapter } = createInMemoryAdapter();
    setGatewayCronAdapterForTests(adapter);

    await setupMonitoring({ cadence: "both" });
    await pauseMonitoring();
    const paused = await pauseMonitoring();
    expect(paused.outcomes.every((o) => o.action === "unchanged")).toBe(true);

    await resumeMonitoring();
    const resumed = await resumeMonitoring();
    expect(resumed.outcomes.every((o) => o.action === "unchanged")).toBe(true);
  });

  it("resume re-enables paused jobs", async () => {
    const { adapter, jobs } = createInMemoryAdapter();
    setGatewayCronAdapterForTests(adapter);

    await setupMonitoring({ cadence: "both" });
    await pauseMonitoring();
    const resumed = await resumeMonitoring();

    expect(resumed.outcomes).toHaveLength(POLITICLAW_CRON_NAMES.length);
    expect(resumed.outcomes.every((o) => o.action === "resumed")).toBe(true);
    for (const job of jobs) {
      expect(job.enabled).toBe(true);
    }
  });
});
