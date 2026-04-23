import { beforeEach, describe, expect, it } from "vitest";

import { openMemoryDb, type PolitiClawDb } from "../../storage/sqlite.js";
import {
  listFeedbackForPackage,
  listNotNowTuples,
  listStopTuples,
  recordPackageFeedback,
} from "./feedback.js";
import { createActionPackage, getActionPackage } from "./packages.js";

function seed(db: PolitiClawDb, hash = "hash-a") {
  return createActionPackage(db, {
    triggerClass: "bill_nearing_vote",
    packageKind: "outreach",
    billId: "119-hr-1",
    issue: "housing",
    decisionHash: hash,
    summary: "s",
    sourceAdapterId: "congressGov",
    sourceTier: 1,
  });
}

describe("recordPackageFeedback", () => {
  let db: PolitiClawDb;
  beforeEach(() => {
    db = openMemoryDb();
  });

  it("not_found when the id does not exist", () => {
    const result = recordPackageFeedback(db, { packageId: 42, verdict: "stop" });
    expect(result.status).toBe("not_found");
  });

  it("useful flips status to 'used' and inserts a feedback row", () => {
    const pkg = seed(db);
    const result = recordPackageFeedback(db, {
      packageId: pkg.id,
      verdict: "useful",
      note: "used the draft",
      now: 100,
    });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.package.status).toBe("used");
    const rows = listFeedbackForPackage(db, pkg.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.verdict).toBe("useful");
    expect(rows[0]!.note).toBe("used the draft");
  });

  it("stop flips status to 'stopped' and registers the tuple in listStopTuples", () => {
    const pkg = seed(db);
    recordPackageFeedback(db, { packageId: pkg.id, verdict: "stop" });
    expect(getActionPackage(db, pkg.id)?.status).toBe("stopped");
    const tuples = listStopTuples(db);
    expect(tuples).toHaveLength(1);
    expect(tuples[0]).toMatchObject({
      triggerClass: "bill_nearing_vote",
      billId: "119-hr-1",
      repId: null,
      issue: "housing",
      electionDate: null,
    });
  });

  it("not_now keeps status 'open' and appears in listNotNowTuples with the latest timestamp", () => {
    const pkg = seed(db);
    recordPackageFeedback(db, { packageId: pkg.id, verdict: "not_now", now: 1_000 });
    recordPackageFeedback(db, { packageId: pkg.id, verdict: "not_now", now: 2_000 });
    expect(getActionPackage(db, pkg.id)?.status).toBe("open");
    const tuples = listNotNowTuples(db);
    expect(tuples).toHaveLength(1);
    expect(tuples[0]!.mostRecentAt).toBe(2_000);
  });

  it("feedback is append-only: multiple rows record even with the same verdict", () => {
    const pkg = seed(db);
    recordPackageFeedback(db, { packageId: pkg.id, verdict: "not_now", now: 1 });
    recordPackageFeedback(db, { packageId: pkg.id, verdict: "not_now", now: 2 });
    recordPackageFeedback(db, { packageId: pkg.id, verdict: "useful", now: 3 });
    const rows = listFeedbackForPackage(db, pkg.id);
    expect(rows.map((r) => r.verdict)).toEqual(["useful", "not_now", "not_now"]);
  });

  it("listStopTuples deduplicates when the same package has multiple stop rows", () => {
    const pkg = seed(db);
    recordPackageFeedback(db, { packageId: pkg.id, verdict: "stop", now: 1 });
    recordPackageFeedback(db, { packageId: pkg.id, verdict: "stop", now: 2 });
    expect(listStopTuples(db)).toHaveLength(1);
  });
});
