import { beforeEach, describe, expect, it } from "vitest";
import { openMemoryDb, type PolitiClawDb } from "../../storage/sqlite.js";
import { createBillsResolver, type BillsResolver } from "../../sources/bills/index.js";
import type { AdapterResult } from "../../sources/common/types.js";
import type { Bill, BillRef, BillListFilters } from "../../sources/bills/types.js";
import { createUpcomingVotesResolver } from "../../sources/upcomingVotes/index.js";
import type {
  UpcomingEvent,
  UpcomingEventsFilters,
} from "../../sources/upcomingVotes/types.js";
import { upsertIssueStance } from "../preferences/index.js";
import { checkUpcomingVotes } from "./upcomingVotes.js";

function okBills(bills: Bill[]): AdapterResult<Bill[]> {
  return {
    status: "ok",
    adapterId: "congressGov",
    tier: 1,
    data: bills,
    fetchedAt: Date.now(),
  };
}

function okBill(bill: Bill): AdapterResult<Bill> {
  return {
    status: "ok",
    adapterId: "congressGov",
    tier: 1,
    data: bill,
    fetchedAt: Date.now(),
  };
}

function okEvents(events: UpcomingEvent[]): AdapterResult<UpcomingEvent[]> {
  return {
    status: "ok",
    adapterId: "congressGov.committeeMeetings",
    tier: 1,
    data: events,
    fetchedAt: Date.now(),
  };
}

function makeBillsResolver(
  listFn: (filters: BillListFilters) => Promise<AdapterResult<Bill[]>>,
  getFn?: (ref: BillRef) => Promise<AdapterResult<Bill>>,
): BillsResolver {
  const resolver = createBillsResolver({ apiDataGovKey: "k" });
  resolver.list = listFn;
  if (getFn) resolver.get = getFn;
  return resolver;
}

function makeEventsResolver(
  listFn: (filters: UpcomingEventsFilters) => Promise<AdapterResult<UpcomingEvent[]>>,
) {
  const resolver = createUpcomingVotesResolver({ apiDataGovKey: "k" });
  resolver.list = listFn;
  return resolver;
}

const baseHousingBill: Bill = {
  id: "119-hr-1234",
  congress: 119,
  billType: "HR",
  number: "1234",
  title: "Clean Housing Investment Act of 2026",
  latestActionDate: "2026-04-10",
  latestActionText: "Referred to the House Committee on Financial Services",
  updateDate: "2026-04-10T00:00:00Z",
  policyArea: "Housing and Community Development",
  subjects: ["Affordable housing"],
};

const baseCleanEnergyBill: Bill = {
  id: "119-s-901",
  congress: 119,
  billType: "S",
  number: "901",
  title: "Clean Energy Tax Credit Extension Act",
  latestActionDate: "2026-04-09",
  latestActionText: "Introduced in Senate",
  updateDate: "2026-04-09T00:00:00Z",
};

const baseEvent: UpcomingEvent = {
  id: "119-house-hearing-116421",
  congress: 119,
  chamber: "House",
  eventType: "hearing",
  title: "Financial Services Oversight Hearing on Affordable Housing Act",
  startDateTime: "2026-04-22T14:00:00Z",
  location: "2128, Rayburn House Office Building",
  committeeName: "Committee on Financial Services",
  relatedBillIds: ["119-hr-1234"],
};

let db: PolitiClawDb;
beforeEach(() => {
  db = openMemoryDb();
});

describe("checkUpcomingVotes", () => {
  it("first run emits every bill + event as 'new'", async () => {
    const bills = makeBillsResolver(async () => okBills([baseHousingBill, baseCleanEnergyBill]));
    const events = makeEventsResolver(async () => okEvents([baseEvent]));

    const result = await checkUpcomingVotes(db, bills, events);
    expect(result.status).toBe("ok");
    expect(result.changedBills.map((cb) => cb.change.reason)).toEqual(["new", "new"]);
    expect(result.changedEvents.map((ce) => ce.change.reason)).toEqual(["new"]);
    expect(result.unchangedBillCount).toBe(0);
    expect(result.unchangedEventCount).toBe(0);
  });

  it("second run on identical payloads returns an empty delta", async () => {
    const bills = makeBillsResolver(
      async () => okBills([baseHousingBill, baseCleanEnergyBill]),
      async (ref) =>
        okBill(ref.billType === "HR" ? baseHousingBill : baseCleanEnergyBill),
    );
    const events = makeEventsResolver(async () => okEvents([baseEvent]));

    await checkUpcomingVotes(db, bills, events);
    const result = await checkUpcomingVotes(db, bills, events);

    expect(result.changedBills).toHaveLength(0);
    expect(result.changedEvents).toHaveLength(0);
    expect(result.unchangedBillCount).toBe(2);
    expect(result.unchangedEventCount).toBe(1);
  });

  it("third run re-emits ONLY the entity that materially changed", async () => {
    const housingV1 = { ...baseHousingBill };
    const housingV2 = {
      ...baseHousingBill,
      latestActionDate: "2026-04-18",
      latestActionText: "Passed House",
      updateDate: "2026-04-18T00:00:00Z",
    };

    let billPayload = [housingV1, baseCleanEnergyBill];
    const bills = makeBillsResolver(
      async () => okBills(billPayload),
      async (ref) => okBill(ref.billType === "HR" ? housingV2 : baseCleanEnergyBill),
    );
    const events = makeEventsResolver(async () => okEvents([baseEvent]));

    await checkUpcomingVotes(db, bills, events);
    await checkUpcomingVotes(db, bills, events);

    billPayload = [housingV2, baseCleanEnergyBill];
    const third = await checkUpcomingVotes(db, bills, events, { refreshBills: true });

    expect(third.changedBills).toHaveLength(1);
    expect(third.changedBills[0]!.bill.id).toBe("119-hr-1234");
    expect(third.changedBills[0]!.change.reason).toBe("changed");
    expect(third.changedBills[0]!.change.previousHash).not.toBeNull();
    expect(third.unchangedBillCount).toBe(1);
    expect(third.changedEvents).toHaveLength(0);
  });

  it("does not re-alert when bill title churns but latestAction is stable (cosmetic change)", async () => {
    const v1 = { ...baseHousingBill };
    const v2 = { ...baseHousingBill, title: "Clean Housing Investment Act of 2026 (as reported)" };

    let payload = [v1];
    const bills = makeBillsResolver(
      async () => okBills(payload),
      async () => okBill(v2),
    );
    const events = makeEventsResolver(async () => okEvents([]));

    await checkUpcomingVotes(db, bills, events);
    payload = [v2];
    const result = await checkUpcomingVotes(db, bills, events, { refreshBills: true });

    expect(result.changedBills).toHaveLength(0);
    expect(result.unchangedBillCount).toBe(1);
  });

  it("treats an event relatedBillIds reorder as unchanged (sorted before hashing)", async () => {
    const v1 = { ...baseEvent, relatedBillIds: ["119-hr-1234", "119-hr-5678"] };
    const v2 = { ...baseEvent, relatedBillIds: ["119-hr-5678", "119-hr-1234"] };

    const bills = makeBillsResolver(async () => okBills([]));
    let eventPayload = [v1];
    const events = makeEventsResolver(async () => okEvents(eventPayload));

    await checkUpcomingVotes(db, bills, events);
    eventPayload = [v2];
    const result = await checkUpcomingVotes(db, bills, events);

    expect(result.changedEvents).toHaveLength(0);
    expect(result.unchangedEventCount).toBe(1);
  });

  it("scores each changed bill against declared stances", async () => {
    upsertIssueStance(db, { issue: "housing", stance: "support", weight: 4 });
    upsertIssueStance(db, { issue: "climate", stance: "support", weight: 3 });
    upsertIssueStance(db, { issue: "tax-policy", stance: "oppose", weight: 2 });

    const bills = makeBillsResolver(async () => okBills([baseHousingBill, baseCleanEnergyBill]));
    const events = makeEventsResolver(async () => okEvents([]));

    const result = await checkUpcomingVotes(db, bills, events);
    const housing = result.changedBills.find((cb) => cb.bill.id === "119-hr-1234");
    expect(housing?.alignment).not.toBeNull();
    expect(housing?.alignment?.matches.length).toBeGreaterThan(0);

    const ranked = result.changedBills.map((cb) => cb.bill.id);
    expect(ranked[0]).toBe("119-hr-1234");
  });

  it("surfaces partial status with per-source reasons when only one source is available", async () => {
    const bills = makeBillsResolver(async () => okBills([baseHousingBill]));
    const events = makeEventsResolver(async () => ({
      status: "unavailable",
      adapterId: "congressGov.committeeMeetings",
      reason: "api.congress.gov http 503",
      actionable: "retry shortly",
    }));

    const result = await checkUpcomingVotes(db, bills, events);
    expect(result.status).toBe("partial");
    expect(result.changedBills).toHaveLength(1);
    expect(result.reasons.events?.reason).toContain("503");
    expect(result.reasons.bills).toBeUndefined();
  });

  it("reports unavailable when neither source succeeds", async () => {
    const bills = makeBillsResolver(async () => ({
      status: "unavailable",
      adapterId: "congressGov",
      reason: "missing key",
      actionable: "set apiDataGov",
    }));
    const events = makeEventsResolver(async () => ({
      status: "unavailable",
      adapterId: "congressGov.committeeMeetings",
      reason: "missing key",
    }));

    const result = await checkUpcomingVotes(db, bills, events);
    expect(result.status).toBe("unavailable");
    expect(result.changedBills).toHaveLength(0);
    expect(result.changedEvents).toHaveLength(0);
    expect(result.reasons.bills?.actionable).toContain("apiDataGov");
  });
});
