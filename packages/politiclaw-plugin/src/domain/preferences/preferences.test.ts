import { describe, expect, it } from "vitest";
import { openMemoryDb } from "../../storage/sqlite.js";
import {
  deleteIssueStance,
  getPreferences,
  IssueStanceSchema,
  listIssueStances,
  listStanceSignals,
  recordStanceSignal,
  upsertIssueStance,
  upsertPreferences,
  PreferencesSchema,
  StanceSignalSchema,
} from "./index.js";

describe("PreferencesSchema", () => {
  it("requires a non-empty address", () => {
    expect(() => PreferencesSchema.parse({ address: "" })).toThrow();
  });

  it("uppercases and validates a 2-letter state code", () => {
    const p = PreferencesSchema.parse({ address: "123 Main", state: "ca" });
    expect(p.state).toBe("CA");
  });

  it("rejects a 3-letter state code", () => {
    expect(() => PreferencesSchema.parse({ address: "123 Main", state: "CAL" })).toThrow();
  });
});

describe("upsertPreferences", () => {
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

describe("StanceSignalSchema", () => {
  it("requires either issue or billId", () => {
    expect(() =>
      StanceSignalSchema.parse({ direction: "agree", source: "onboarding" }),
    ).toThrow();
  });

  it("defaults weight to 1.0", () => {
    const s = StanceSignalSchema.parse({
      direction: "agree",
      source: "onboarding",
      issue: "climate",
    });
    expect(s.weight).toBe(1.0);
  });

  it("rejects negative weights", () => {
    expect(() =>
      StanceSignalSchema.parse({
        direction: "agree",
        source: "onboarding",
        issue: "climate",
        weight: -1,
      }),
    ).toThrow();
  });
});

describe("recordStanceSignal", () => {
  it("writes the signal and returns its id", () => {
    const db = openMemoryDb();
    const id = recordStanceSignal(db, {
      direction: "agree",
      source: "onboarding",
      issue: "climate",
      weight: 1,
    });
    expect(id).toBeGreaterThan(0);

    const rows = listStanceSignals(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.issue).toBe("climate");
    expect(rows[0]?.direction).toBe("agree");
  });

  it("lists signals newest-first", () => {
    const db = openMemoryDb();
    recordStanceSignal(db, { direction: "agree", source: "onboarding", issue: "a", weight: 1 });
    recordStanceSignal(db, { direction: "disagree", source: "monitoring", issue: "b", weight: 1 });
    recordStanceSignal(db, { direction: "skip", source: "dashboard", billId: "hr-1", weight: 1 });

    const rows = listStanceSignals(db);
    expect(rows.map((r) => r.direction)).toEqual(["skip", "disagree", "agree"]);
    expect(rows[0]?.billId).toBe("hr-1");
  });
});

describe("IssueStanceSchema", () => {
  it("normalizes the issue slug to lowercase kebab-case", () => {
    const parsed = IssueStanceSchema.parse({
      issue: "Affordable Housing",
      stance: "support",
      weight: 4,
    });
    expect(parsed.issue).toBe("affordable-housing");
  });

  it("rejects weights outside 1-5", () => {
    expect(() =>
      IssueStanceSchema.parse({ issue: "x", stance: "support", weight: 6 }),
    ).toThrow();
    expect(() =>
      IssueStanceSchema.parse({ issue: "x", stance: "support", weight: 0 }),
    ).toThrow();
  });

  it("defaults weight to 3 when omitted", () => {
    const parsed = IssueStanceSchema.parse({ issue: "climate", stance: "support" });
    expect(parsed.weight).toBe(3);
  });
});

describe("upsertIssueStance", () => {
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
