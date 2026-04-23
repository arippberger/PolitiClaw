import { beforeEach, describe, expect, it } from "vitest";

import { openMemoryDb, type PolitiClawDb } from "../../storage/sqlite.js";
import {
  attachGeneratedCallScript,
  attachGeneratedLetter,
  attachGeneratedReminder,
  createActionPackage,
  findOpenByTarget,
  getActionPackage,
  listOpenActionPackages,
  listOpenActionPackagesForRep,
  setPackageStatus,
  sweepExpired,
} from "./packages.js";

function seedOutreachPackage(
  db: PolitiClawDb,
  opts: {
    triggerClass?: "bill_nearing_vote" | "repeated_misalignment" | "new_bill_high_relevance";
    billId?: string | null;
    repId?: string | null;
    issue?: string | null;
    decisionHash?: string;
    now?: number;
  } = {},
) {
  return createActionPackage(db, {
    triggerClass: opts.triggerClass ?? "bill_nearing_vote",
    packageKind: "outreach",
    outreachMode: null,
    billId: opts.billId ?? "119-hr-1",
    repId: opts.repId ?? null,
    issue: opts.issue ?? "housing",
    decisionHash: opts.decisionHash ?? "hash-a",
    summary: "HR 1 nearing vote.",
    sourceAdapterId: "congressGov",
    sourceTier: 1,
    now: opts.now,
  });
}

describe("createActionPackage", () => {
  let db: PolitiClawDb;
  beforeEach(() => {
    db = openMemoryDb();
  });

  it("inserts a new row with status 'open'", () => {
    const row = seedOutreachPackage(db, { now: 1_000 });
    expect(row.id).toBeGreaterThan(0);
    expect(row.status).toBe("open");
    expect(row.createdAt).toBe(1_000);
    expect(row.statusAt).toBe(1_000);
    expect(row.triggerClass).toBe("bill_nearing_vote");
    expect(row.packageKind).toBe("outreach");
  });

  it("is idempotent on the decision-tuple: second call returns the same row", () => {
    const first = seedOutreachPackage(db, { decisionHash: "h1" });
    const second = seedOutreachPackage(db, { decisionHash: "h1" });
    expect(second.id).toBe(first.id);
    expect(listOpenActionPackages(db)).toHaveLength(1);
  });

  it("distinguishes rows whose decision_hash differs even with the same target", () => {
    seedOutreachPackage(db, { decisionHash: "h1" });
    seedOutreachPackage(db, { decisionHash: "h2" });
    expect(listOpenActionPackages(db)).toHaveLength(2);
  });

  it("does not resurrect a stopped package: re-create returns the stopped row", () => {
    const first = seedOutreachPackage(db);
    setPackageStatus(db, first.id, "stopped");
    const second = seedOutreachPackage(db);
    expect(second.id).toBe(first.id);
    expect(second.status).toBe("stopped");
  });

  it("treats null fields as matching nulls in the dedup index", () => {
    const a = createActionPackage(db, {
      triggerClass: "tracked_event_scheduled",
      packageKind: "reminder",
      billId: null,
      repId: null,
      issue: null,
      decisionHash: "ev-h",
      summary: "ev",
      sourceAdapterId: "congressGov.committeeMeetings",
      sourceTier: 1,
    });
    const b = createActionPackage(db, {
      triggerClass: "tracked_event_scheduled",
      packageKind: "reminder",
      billId: null,
      repId: null,
      issue: null,
      decisionHash: "ev-h",
      summary: "ev 2",
      sourceAdapterId: "congressGov.committeeMeetings",
      sourceTier: 1,
    });
    expect(b.id).toBe(a.id);
    expect(b.summary).toBe("ev");
  });
});

describe("setPackageStatus", () => {
  let db: PolitiClawDb;
  beforeEach(() => {
    db = openMemoryDb();
  });

  it("flips open -> used and stamps status_at", () => {
    const row = seedOutreachPackage(db, { now: 1_000 });
    const updated = setPackageStatus(db, row.id, "used", 2_000);
    expect(updated?.status).toBe("used");
    expect(updated?.statusAt).toBe(2_000);
  });

  it("is one-way: transitions from a terminal status are no-ops", () => {
    const row = seedOutreachPackage(db);
    setPackageStatus(db, row.id, "stopped", 10);
    const attempt = setPackageStatus(db, row.id, "used", 20);
    expect(attempt?.status).toBe("stopped");
    expect(attempt?.statusAt).toBe(10);
  });

  it("returns null semantics: returns the row when id does not exist", () => {
    const result = setPackageStatus(db, 99_999, "used");
    expect(result).toBeNull();
  });
});

describe("attachGenerated* helpers", () => {
  let db: PolitiClawDb;
  beforeEach(() => {
    db = openMemoryDb();
  });

  it("attachGeneratedLetter records the letter id and flips status to used", () => {
    const row = seedOutreachPackage(db, { now: 1_000 });
    const updated = attachGeneratedLetter(db, row.id, 42, 2_000);
    expect(updated?.generatedLetterId).toBe(42);
    expect(updated?.status).toBe("used");
    expect(updated?.statusAt).toBe(2_000);
  });

  it("attachGeneratedCallScript does not un-stop a stopped package", () => {
    const row = seedOutreachPackage(db);
    setPackageStatus(db, row.id, "stopped", 5);
    const updated = attachGeneratedCallScript(db, row.id, 7, 9);
    expect(updated?.generatedCallScriptId).toBe(7);
    expect(updated?.status).toBe("stopped");
    expect(updated?.statusAt).toBe(5);
  });

  it("attachGeneratedReminder sets the reminder pointer", () => {
    const row = createActionPackage(db, {
      triggerClass: "tracked_event_scheduled",
      packageKind: "reminder",
      billId: "119-hr-1",
      decisionHash: "ev-h",
      summary: "ev",
      sourceAdapterId: "x",
      sourceTier: 1,
    });
    const updated = attachGeneratedReminder(db, row.id, 99);
    expect(updated?.generatedReminderId).toBe(99);
    expect(updated?.status).toBe("used");
  });
});

describe("sweepExpired", () => {
  let db: PolitiClawDb;
  beforeEach(() => {
    db = openMemoryDb();
  });

  it("flips past-election packages to expired", () => {
    const row = createActionPackage(db, {
      triggerClass: "election_proximity",
      packageKind: "election_prep_prompt",
      electionDate: "2026-03-01",
      decisionHash: "past",
      summary: "past",
      sourceAdapterId: "googleCivic",
      sourceTier: 2,
    });
    const now = Date.parse("2026-04-22T00:00:00Z");
    const changed = sweepExpired(db, now);
    expect(changed).toBe(1);
    const after = getActionPackage(db, row.id);
    expect(after?.status).toBe("expired");
  });

  it("leaves future-election and null-election rows alone", () => {
    const future = createActionPackage(db, {
      triggerClass: "election_proximity",
      packageKind: "election_prep_prompt",
      electionDate: "2099-11-03",
      decisionHash: "future",
      summary: "future",
      sourceAdapterId: "googleCivic",
      sourceTier: 2,
    });
    const bill = seedOutreachPackage(db);
    const now = Date.parse("2026-04-22T00:00:00Z");
    sweepExpired(db, now);
    expect(getActionPackage(db, future.id)?.status).toBe("open");
    expect(getActionPackage(db, bill.id)?.status).toBe("open");
  });
});

describe("listOpenActionPackages / findOpenByTarget", () => {
  let db: PolitiClawDb;
  beforeEach(() => {
    db = openMemoryDb();
  });

  it("only returns open rows, newest first", () => {
    const a = seedOutreachPackage(db, { decisionHash: "h-a", now: 1_000 });
    const b = seedOutreachPackage(db, { decisionHash: "h-b", now: 2_000 });
    setPackageStatus(db, a.id, "dismissed");
    const open = listOpenActionPackages(db);
    expect(open.map((o) => o.id)).toEqual([b.id]);
  });

  it("findOpenByTarget matches null fields as null", () => {
    const row = seedOutreachPackage(db, {
      billId: "119-hr-1",
      repId: null,
      issue: "housing",
      decisionHash: "h-x",
    });
    const hits = findOpenByTarget(db, "bill_nearing_vote", "119-hr-1", null, "housing");
    expect(hits.map((h) => h.id)).toEqual([row.id]);
    const misses = findOpenByTarget(db, "bill_nearing_vote", "119-hr-1", "R", "housing");
    expect(misses).toEqual([]);
  });

  it("listOpenActionPackagesForRep scopes to one rep", () => {
    seedOutreachPackage(db, { repId: "R1", decisionHash: "h1" });
    seedOutreachPackage(db, { repId: "R2", decisionHash: "h2" });
    const r1 = listOpenActionPackagesForRep(db, "R1");
    expect(r1).toHaveLength(1);
    expect(r1[0]!.repId).toBe("R1");
  });
});
