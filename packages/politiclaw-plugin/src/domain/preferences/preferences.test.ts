import { describe, expect, it } from "vitest";
import { openMemoryDb } from "../../storage/sqlite.js";
import { parse } from "../../validation/typebox.js";
import {
  deleteIssueStance,
  getPreferences,
  listIssueStances,
  recordStanceSignal,
  setMonitoringMode,
  upsertIssueStance,
  upsertPreferences,
  MonitoringModeSchema,
} from "./index.js";

type StoredSignal = {
  id: number;
  bill_id: string | null;
  direction: "agree" | "disagree" | "skip";
  weight: number;
  source: string;
};

function readSignals(db: ReturnType<typeof openMemoryDb>): StoredSignal[] {
  return db
    .prepare(
      `SELECT id, bill_id, direction, weight, source
         FROM stance_signals
        ORDER BY id DESC`,
    )
    .all() as StoredSignal[];
}

describe("upsertPreferences", () => {
  it("requires a non-empty address", () => {
    const db = openMemoryDb();
    expect(() => upsertPreferences(db, { address: "" })).toThrow();
  });

  it("uppercases and validates a 2-letter state code", () => {
    const db = openMemoryDb();
    upsertPreferences(db, { address: "123 Main", state: "ca" });
    expect(getPreferences(db)?.state).toBe("CA");
  });

  it("rejects a 3-letter state code", () => {
    const db = openMemoryDb();
    expect(() =>
      upsertPreferences(db, { address: "123 Main", state: "CAL" }),
    ).toThrow();
  });

  it("inserts and overwrites the single-row preferences table", () => {
    const db = openMemoryDb();
    expect(getPreferences(db)).toBeNull();

    upsertPreferences(db, { address: "123 Main", state: "ca", zip: "94110" });
    const first = getPreferences(db);
    expect(first?.address).toBe("123 Main");
    expect(first?.state).toBe("CA");

    upsertPreferences(db, { address: "456 Oak", state: "wa" });
    const second = getPreferences(db);
    expect(second?.address).toBe("456 Oak");
    expect(second?.state).toBe("WA");
    expect(second?.zip).toBeUndefined();

    const count = (
      db.prepare("SELECT COUNT(*) AS n FROM preferences").get() as { n: number }
    ).n;
    expect(count).toBe(1);
  });
});

describe("recordStanceSignal", () => {
  it("requires a billId", () => {
    const db = openMemoryDb();
    expect(() =>
      recordStanceSignal(db, {
        direction: "agree",
        source: "onboarding",
      } as Parameters<typeof recordStanceSignal>[1]),
    ).toThrow();
  });

  it("defaults weight to 1.0 when omitted", () => {
    const db = openMemoryDb();
    recordStanceSignal(db, {
      direction: "agree",
      source: "onboarding",
      billId: "119-hr-1",
    });
    const rows = readSignals(db);
    expect(rows[0]?.weight).toBe(1.0);
  });

  it("rejects negative weights", () => {
    const db = openMemoryDb();
    expect(() =>
      recordStanceSignal(db, {
        direction: "agree",
        source: "onboarding",
        billId: "119-hr-1",
        weight: -1,
      }),
    ).toThrow();
  });

  it("writes the signal and returns its id", () => {
    const db = openMemoryDb();
    const id = recordStanceSignal(db, {
      direction: "agree",
      source: "onboarding",
      billId: "119-hr-1",
      weight: 1,
    });
    expect(id).toBeGreaterThan(0);

    const rows = readSignals(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.bill_id).toBe("119-hr-1");
    expect(rows[0]?.direction).toBe("agree");
  });

  it("stores signals in insertion order", () => {
    const db = openMemoryDb();
    recordStanceSignal(db, { direction: "agree", source: "onboarding", billId: "hr-a", weight: 1 });
    recordStanceSignal(db, { direction: "disagree", source: "monitoring", billId: "hr-b", weight: 1 });
    recordStanceSignal(db, { direction: "skip", source: "dashboard", billId: "hr-c", weight: 1 });

    const rows = readSignals(db);
    expect(rows.map((r) => r.direction)).toEqual(["skip", "disagree", "agree"]);
    expect(rows[0]?.bill_id).toBe("hr-c");
  });
});

describe("upsertIssueStance", () => {
  it("normalizes the issue slug to lowercase kebab-case", () => {
    const db = openMemoryDb();
    upsertIssueStance(db, {
      issue: "Affordable Housing",
      stance: "support",
      weight: 4,
    });
    expect(listIssueStances(db)[0]?.issue).toBe("affordable-housing");
  });

  it("rejects weights outside 1-5", () => {
    const db = openMemoryDb();
    expect(() =>
      upsertIssueStance(db, { issue: "x", stance: "support", weight: 6 }),
    ).toThrow();
    expect(() =>
      upsertIssueStance(db, { issue: "x", stance: "support", weight: 0 }),
    ).toThrow();
  });

  it("defaults weight to 3 when omitted", () => {
    const db = openMemoryDb();
    upsertIssueStance(db, { issue: "climate", stance: "support" });
    expect(listIssueStances(db)[0]?.weight).toBe(3);
  });

  it("inserts and updates by issue slug", () => {
    const db = openMemoryDb();
    upsertIssueStance(db, { issue: "climate", stance: "support", weight: 5 });
    upsertIssueStance(db, { issue: "housing", stance: "support", weight: 3 });
    expect(listIssueStances(db).map((row) => row.issue)).toEqual(["climate", "housing"]);

    upsertIssueStance(db, { issue: "climate", stance: "oppose", weight: 2 });
    const rows = listIssueStances(db);
    const climate = rows.find((row) => row.issue === "climate");
    expect(climate?.stance).toBe("oppose");
    expect(climate?.weight).toBe(2);
    expect(rows).toHaveLength(2);
  });

  it("orders listings by weight descending then issue ascending", () => {
    const db = openMemoryDb();
    upsertIssueStance(db, { issue: "zebra", stance: "support", weight: 3 });
    upsertIssueStance(db, { issue: "apple", stance: "support", weight: 3 });
    upsertIssueStance(db, { issue: "banana", stance: "support", weight: 5 });
    expect(listIssueStances(db).map((row) => row.issue)).toEqual([
      "banana",
      "apple",
      "zebra",
    ]);
  });
});

describe("deleteIssueStance", () => {
  it("removes the row and reports whether a row was deleted", () => {
    const db = openMemoryDb();
    upsertIssueStance(db, { issue: "climate", stance: "support", weight: 4 });
    expect(deleteIssueStance(db, "Climate")).toBe(true);
    expect(listIssueStances(db)).toHaveLength(0);
    expect(deleteIssueStance(db, "climate")).toBe(false);
  });
});

describe("MonitoringModeSchema", () => {
  it("accepts the five documented modes", () => {
    for (const mode of [
      "off",
      "quiet_watch",
      "weekly_digest",
      "action_only",
      "full_copilot",
    ] as const) {
      expect(parse(MonitoringModeSchema, mode)).toBe(mode);
    }
  });

  it("rejects unknown values", () => {
    expect(() => parse(MonitoringModeSchema, "shouty")).toThrow();
  });
});

describe("setMonitoringMode", () => {
  it("updates the mode on the existing preferences row", () => {
    const db = openMemoryDb();
    upsertPreferences(db, { address: "123 Main", state: "CA" });
    const before = getPreferences(db);
    expect(before?.monitoringMode).toBe("action_only");

    const after = setMonitoringMode(db, "full_copilot");
    expect(after.monitoringMode).toBe("full_copilot");
    expect(after.address).toBe("123 Main");
    expect(getPreferences(db)?.monitoringMode).toBe("full_copilot");
  });

  it("throws when no preferences row exists yet", () => {
    const db = openMemoryDb();
    expect(() => setMonitoringMode(db, "off")).toThrow(
      /politiclaw_configure/,
    );
  });
});

describe("upsertPreferences mode handling", () => {
  it("defaults to 'action_only' on first insert", () => {
    const db = openMemoryDb();
    const row = upsertPreferences(db, { address: "123 Main", state: "CA" });
    expect(row.monitoringMode).toBe("action_only");
  });

  it("preserves an already-saved mode across address updates", () => {
    const db = openMemoryDb();
    upsertPreferences(db, { address: "123 Main", state: "CA" });
    setMonitoringMode(db, "off");
    upsertPreferences(db, { address: "456 Oak", state: "WA" });
    expect(getPreferences(db)?.monitoringMode).toBe("off");
  });

  it("lets a caller override the mode inline when provided", () => {
    const db = openMemoryDb();
    const row = upsertPreferences(db, {
      address: "123 Main",
      state: "CA",
      monitoringMode: "weekly_digest",
    });
    expect(row.monitoringMode).toBe("weekly_digest");
  });
});

import { buildMonitoringContract } from "./contract.js";

describe("buildMonitoringContract", () => {
  it("labels gateway-disabled jobs as feature_unavailable", async () => {
    const db = openMemoryDb();
    upsertPreferences(db, {
      address: "123 Main",
      state: "CA",
      monitoringMode: "weekly_digest",
    });

    const contract = await buildMonitoringContract({
      db,
      config: { apiKeys: { apiDataGov: "test-key" } },
      cronAdapter: {
        async list() {
          return [
            {
              id: "1",
              name: "politiclaw.weekly_summary",
              description: "weekly",
              enabled: false,
              schedule: { kind: "every", everyMs: 604800000 },
              sessionTarget: "isolated",
              wakeMode: "next-heartbeat",
              payload: { kind: "agentTurn", message: "x" },
            },
          ];
        },
      },
    });

    const inactive = contract.inactiveJobs.find((j) => j.name === "politiclaw.weekly_summary");
    expect(inactive?.reason).toBe("feature_unavailable");
  });

  it("describes quiet_watch as material-change driven", async () => {
    const db = openMemoryDb();
    upsertPreferences(db, {
      address: "123 Main",
      state: "CA",
      monitoringMode: "quiet_watch",
    });

    const contract = await buildMonitoringContract({
      db,
      config: { apiKeys: { apiDataGov: "test-key" } },
    });

    expect(contract.monitoring.plainEnglish.toLowerCase()).toContain("materially changes");
  });
});
