import { beforeEach, describe, expect, it } from "vitest";

import { openMemoryDb, type PolitiClawDb } from "../../storage/sqlite.js";
import type { ChangeDetectionResult } from "../monitoring/changeDetection.js";
import type {
  ChangedEvent,
  CheckUpcomingVotesResult,
  ScoredBillChange,
} from "../monitoring/upcomingVotes.js";
import type { StoredBill } from "../bills/index.js";
import type { AlignmentResult } from "../scoring/alignment.js";
import type { UpcomingEvent } from "../../sources/upcomingVotes/types.js";

import {
  classifyActionMoments,
  electionDaysBucket,
  hashDecisionInputs,
} from "./triggers.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-04-22T00:00:00Z");

function makeBill(overrides: Partial<StoredBill> = {}): StoredBill {
  return {
    id: "119-hr-1234",
    congress: 119,
    billType: "HR",
    number: "1234",
    title: "Clean Housing Investment Act",
    latestActionDate: "2026-04-10",
    latestActionText: "Referred to committee",
    updateDate: "2026-04-10T00:00:00Z",
    policyArea: "Housing",
    subjects: ["Affordable housing"],
    lastSynced: NOW,
    sourceAdapterId: "congressGov",
    sourceTier: 1,
    ...overrides,
  } as StoredBill;
}

function makeChange(reason: ChangeDetectionResult["reason"] = "changed"): ChangeDetectionResult {
  return {
    changed: reason !== "unchanged",
    reason,
    currentHash: "h-current",
    previousHash: reason === "new" ? null : "h-prev",
    lastChangedAt: NOW,
    firstSeenAt: NOW,
  };
}

function makeAlignment(overrides: Partial<AlignmentResult> = {}): AlignmentResult {
  return {
    relevance: 0.7,
    confidence: 0.6,
    belowConfidenceFloor: false,
    matches: [
      { issue: "affordable-housing", stance: "support", stanceWeight: 4, location: "subject", matchedText: "housing" },
    ],
    rationale: "matched on subject Affordable housing",
    stanceSnapshotHash: "sh-1",
    ...overrides,
  };
}

function makeScoredBill(
  bill: StoredBill,
  alignment: AlignmentResult | null,
  changeReason: ChangeDetectionResult["reason"] = "changed",
): ScoredBillChange {
  return { bill, change: makeChange(changeReason), alignment };
}

function makeEvent(overrides: Partial<UpcomingEvent> = {}): UpcomingEvent {
  return {
    id: "ev-1",
    congress: 119,
    chamber: "House",
    eventType: "committee_meeting",
    title: "Financial Services markup",
    startDateTime: new Date(NOW + 10 * MS_PER_DAY).toISOString(),
    committeeName: "Financial Services",
    relatedBillIds: ["119-hr-1234"],
    ...overrides,
  };
}

function makeChangedEvent(event: UpcomingEvent, reason: ChangeDetectionResult["reason"] = "new"): ChangedEvent {
  return { event, change: makeChange(reason) };
}

function makeResult(
  overrides: Partial<CheckUpcomingVotesResult> = {},
): CheckUpcomingVotesResult {
  return {
    status: "ok",
    changedBills: [],
    unchangedBillCount: 0,
    mutedBillCount: 0,
    changedEvents: [],
    unchangedEventCount: 0,
    mutedEventCount: 0,
    actionPackages: [],
    source: {
      bills: { adapterId: "congressGov", tier: 1 },
      events: { adapterId: "congressGov.committeeMeetings", tier: 1 },
    },
    reasons: {},
    ...overrides,
  };
}

describe("hashDecisionInputs", () => {
  it("is deterministic under key reordering", () => {
    const a = hashDecisionInputs({ billId: "119-hr-1", triggerClass: "bill_nearing_vote", relevanceBucket: 0.7 });
    const b = hashDecisionInputs({ relevanceBucket: 0.7, triggerClass: "bill_nearing_vote", billId: "119-hr-1" });
    expect(a).toBe(b);
  });

  it("changes when a field differs", () => {
    const a = hashDecisionInputs({ billId: "119-hr-1", relevanceBucket: 0.6 });
    const b = hashDecisionInputs({ billId: "119-hr-1", relevanceBucket: 0.7 });
    expect(a).not.toBe(b);
  });
});

describe("electionDaysBucket", () => {
  it("returns the matching bucket at each threshold", () => {
    expect(electionDaysBucket(1)).toBe(1);
    expect(electionDaysBucket(7)).toBe(7);
    expect(electionDaysBucket(14)).toBe(14);
  });

  it("returns null outside the window", () => {
    expect(electionDaysBucket(0)).toBeNull();
    expect(electionDaysBucket(15)).toBeNull();
    expect(electionDaysBucket(-2)).toBeNull();
  });

  it("rounds down into the nearest inner bucket", () => {
    expect(electionDaysBucket(8)).toBe(14);
    expect(electionDaysBucket(2)).toBe(7);
  });
});

describe("classifyActionMoments — bill_nearing_vote thresholds", () => {
  let db: PolitiClawDb;
  beforeEach(() => {
    db = openMemoryDb();
  });

  it("fires at relevance 0.60 and confidence 0.40 with a qualifying event in 14d", () => {
    const bill = makeBill();
    const event = makeEvent({
      startDateTime: new Date(NOW + 14 * MS_PER_DAY - 1).toISOString(),
      eventType: "committee_meeting",
    });
    const result = makeResult({
      changedBills: [
        makeScoredBill(bill, makeAlignment({ relevance: 0.6, confidence: 0.4 })),
      ],
      changedEvents: [makeChangedEvent(event)],
    });

    const candidates = classifyActionMoments(db, result, { now: NOW });
    const nearing = candidates.filter((c) => c.triggerClass === "bill_nearing_vote");
    expect(nearing).toHaveLength(1);
    expect(nearing[0]!.target.billId).toBe(bill.id);
    expect(nearing[0]!.packageKind).toBe("outreach");
  });

  it("does not fire at relevance 0.59", () => {
    const bill = makeBill();
    const result = makeResult({
      changedBills: [
        makeScoredBill(bill, makeAlignment({ relevance: 0.59, confidence: 0.9 })),
      ],
      changedEvents: [makeChangedEvent(makeEvent())],
    });
    const candidates = classifyActionMoments(db, result, { now: NOW });
    expect(candidates.find((c) => c.triggerClass === "bill_nearing_vote")).toBeUndefined();
  });

  it("does not fire at confidence 0.39", () => {
    const bill = makeBill();
    const result = makeResult({
      changedBills: [
        makeScoredBill(bill, makeAlignment({ relevance: 0.9, confidence: 0.39 })),
      ],
      changedEvents: [makeChangedEvent(makeEvent())],
    });
    const candidates = classifyActionMoments(db, result, { now: NOW });
    expect(candidates.find((c) => c.triggerClass === "bill_nearing_vote")).toBeUndefined();
  });

  it("does not fire when the nearest event is > 14d out", () => {
    const bill = makeBill();
    const event = makeEvent({
      startDateTime: new Date(NOW + 15 * MS_PER_DAY).toISOString(),
    });
    const result = makeResult({
      changedBills: [makeScoredBill(bill, makeAlignment())],
      changedEvents: [makeChangedEvent(event)],
    });
    const candidates = classifyActionMoments(db, result, { now: NOW });
    expect(candidates.find((c) => c.triggerClass === "bill_nearing_vote")).toBeUndefined();
  });

  it("ignores 'hearing' event type — only committee_meeting / markup qualify", () => {
    const bill = makeBill();
    const event = makeEvent({ eventType: "hearing" });
    const result = makeResult({
      changedBills: [makeScoredBill(bill, makeAlignment())],
      changedEvents: [makeChangedEvent(event)],
    });
    const candidates = classifyActionMoments(db, result, { now: NOW });
    expect(candidates.find((c) => c.triggerClass === "bill_nearing_vote")).toBeUndefined();
  });

  it("suppresses when belowConfidenceFloor is true even if relevance is high", () => {
    const bill = makeBill();
    const result = makeResult({
      changedBills: [
        makeScoredBill(
          bill,
          makeAlignment({ relevance: 0.95, confidence: 0.3, belowConfidenceFloor: true }),
        ),
      ],
      changedEvents: [makeChangedEvent(makeEvent())],
    });
    const candidates = classifyActionMoments(db, result, { now: NOW });
    expect(candidates.find((c) => c.triggerClass === "bill_nearing_vote")).toBeUndefined();
  });

  it("'unchanged' and 'schema_bump' reasons never produce candidates", () => {
    const bill = makeBill();
    for (const reason of ["unchanged", "schema_bump"] as const) {
      const result = makeResult({
        changedBills: [makeScoredBill(bill, makeAlignment(), reason)],
        changedEvents: [makeChangedEvent(makeEvent())],
      });
      const candidates = classifyActionMoments(db, result, { now: NOW });
      expect(candidates).toHaveLength(0);
    }
  });
});

describe("classifyActionMoments — new_bill_high_relevance", () => {
  let db: PolitiClawDb;
  beforeEach(() => {
    db = openMemoryDb();
  });

  it("fires on a new bill with relevance 0.7 / confidence 0.5 and no scheduled event", () => {
    const bill = makeBill();
    const result = makeResult({
      changedBills: [
        makeScoredBill(bill, makeAlignment({ relevance: 0.7, confidence: 0.5 }), "new"),
      ],
      changedEvents: [],
    });
    const candidates = classifyActionMoments(db, result, { now: NOW });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.triggerClass).toBe("new_bill_high_relevance");
  });

  it("yields to bill_nearing_vote for the same bill when both would qualify", () => {
    const bill = makeBill();
    const result = makeResult({
      changedBills: [
        makeScoredBill(bill, makeAlignment({ relevance: 0.8, confidence: 0.6 }), "new"),
      ],
      changedEvents: [makeChangedEvent(makeEvent())],
    });
    const candidates = classifyActionMoments(db, result, { now: NOW });
    expect(candidates.map((c) => c.triggerClass)).toEqual(["bill_nearing_vote"]);
  });

  it("does not fire at relevance 0.69 (new bill)", () => {
    const bill = makeBill();
    const result = makeResult({
      changedBills: [
        makeScoredBill(bill, makeAlignment({ relevance: 0.69, confidence: 0.9 }), "new"),
      ],
    });
    const candidates = classifyActionMoments(db, result, { now: NOW });
    expect(candidates).toHaveLength(0);
  });

  it("does not fire when change.reason !== 'new'", () => {
    const bill = makeBill();
    const result = makeResult({
      changedBills: [
        makeScoredBill(bill, makeAlignment({ relevance: 0.8, confidence: 0.6 }), "changed"),
      ],
    });
    const candidates = classifyActionMoments(db, result, { now: NOW });
    expect(candidates.find((c) => c.triggerClass === "new_bill_high_relevance")).toBeUndefined();
  });
});

describe("classifyActionMoments — tracked_event_scheduled", () => {
  let db: PolitiClawDb;
  beforeEach(() => {
    db = openMemoryDb();
  });

  it("fires on a tracked event within 7d when no bill crossed nearing-vote", () => {
    const event = makeEvent({
      id: "ev-2",
      startDateTime: new Date(NOW + 3 * MS_PER_DAY).toISOString(),
      eventType: "markup",
    });
    const result = makeResult({ changedEvents: [makeChangedEvent(event)] });
    const candidates = classifyActionMoments(db, result, { now: NOW });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.triggerClass).toBe("tracked_event_scheduled");
    expect(candidates[0]!.packageKind).toBe("reminder");
  });

  it("does not fire when > 7d out", () => {
    const event = makeEvent({
      startDateTime: new Date(NOW + 8 * MS_PER_DAY).toISOString(),
    });
    const result = makeResult({ changedEvents: [makeChangedEvent(event)] });
    const candidates = classifyActionMoments(db, result, { now: NOW });
    expect(candidates).toHaveLength(0);
  });

  it("suppresses the reminder when an associated bill already produced bill_nearing_vote", () => {
    const bill = makeBill();
    const event = makeEvent({
      startDateTime: new Date(NOW + 3 * MS_PER_DAY).toISOString(),
    });
    const result = makeResult({
      changedBills: [makeScoredBill(bill, makeAlignment())],
      changedEvents: [makeChangedEvent(event)],
    });
    const candidates = classifyActionMoments(db, result, { now: NOW });
    expect(candidates.map((c) => c.triggerClass)).toEqual(["bill_nearing_vote"]);
  });
});
