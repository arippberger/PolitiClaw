import { describe, expect, it } from "vitest";
import { openMemoryDb } from "../../storage/sqlite.js";
import { createBillsResolver } from "../../sources/bills/index.js";
import type { AdapterResult } from "../../sources/common/types.js";
import type { Bill, BillListFilters, BillRef } from "../../sources/bills/types.js";
import { getBillDetail, listCachedBills, searchBills } from "./index.js";

function fakeResolver(overrides: {
  list?: (filters: BillListFilters) => Promise<AdapterResult<Bill[]>>;
  get?: (ref: BillRef) => Promise<AdapterResult<Bill>>;
} = {}) {
  // Create via `createBillsResolver` so the return type matches `BillsResolver`
  // then replace its methods with test doubles.
  const resolver = createBillsResolver({ apiDataGovKey: "k" });
  if (overrides.list) resolver.list = overrides.list;
  if (overrides.get) resolver.get = overrides.get;
  return resolver;
}

const baseBill: Bill = {
  id: "119-hr-1234",
  congress: 119,
  billType: "HR",
  number: "1234",
  title: "Clean Housing Investment Act of 2026",
  originChamber: "House",
  latestActionDate: "2026-04-10",
  latestActionText: "Referred to Committee on Financial Services.",
  updateDate: "2026-04-15",
};

describe("searchBills", () => {
  it("persists adapter output and returns stored rows with provenance", async () => {
    const db = openMemoryDb();
    const list = async () =>
      ({
        status: "ok",
        adapterId: "congressGov",
        tier: 1,
        data: [baseBill],
        fetchedAt: Date.now(),
      }) as AdapterResult<Bill[]>;

    const result = await searchBills(db, fakeResolver({ list }), {
      congress: 119,
      billType: "HR",
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.fromCache).toBe(false);
    expect(result.source.adapterId).toBe("congressGov");
    expect(result.bills).toHaveLength(1);
    expect(result.bills[0]!.id).toBe("119-hr-1234");
    expect(result.bills[0]!.sourceTier).toBe(1);
  });

  it("returns cached rows on a second call and does not re-fetch", async () => {
    const db = openMemoryDb();
    let calls = 0;
    const list = async () => {
      calls += 1;
      return {
        status: "ok",
        adapterId: "congressGov",
        tier: 1,
        data: [baseBill],
        fetchedAt: Date.now(),
      } as AdapterResult<Bill[]>;
    };
    const resolver = fakeResolver({ list });

    await searchBills(db, resolver, { congress: 119, billType: "HR" });
    const second = await searchBills(db, resolver, { congress: 119, billType: "HR" });

    expect(calls).toBe(1);
    expect(second.status).toBe("ok");
    if (second.status !== "ok") return;
    expect(second.fromCache).toBe(true);
  });

  it("re-fetches when refresh=true is passed", async () => {
    const db = openMemoryDb();
    let calls = 0;
    const list = async () => {
      calls += 1;
      return {
        status: "ok",
        adapterId: "congressGov",
        tier: 1,
        data: [baseBill],
        fetchedAt: Date.now(),
      } as AdapterResult<Bill[]>;
    };
    const resolver = fakeResolver({ list });

    await searchBills(db, resolver, { congress: 119, billType: "HR" });
    await searchBills(db, resolver, { congress: 119, billType: "HR" }, { refresh: true });

    expect(calls).toBe(2);
  });

  it("applies client-side title filter against cached rows", async () => {
    const db = openMemoryDb();
    const otherBill: Bill = {
      ...baseBill,
      id: "119-hr-5678",
      number: "5678",
      title: "Carbon Border Adjustment Act",
    };
    const list = async () =>
      ({
        status: "ok",
        adapterId: "congressGov",
        tier: 1,
        data: [baseBill, otherBill],
        fetchedAt: Date.now(),
      }) as AdapterResult<Bill[]>;

    await searchBills(db, fakeResolver({ list }), { congress: 119, billType: "HR" });

    const cached = listCachedBills(db, {
      congress: 119,
      billType: "HR",
      titleContains: "housing",
    });
    expect(cached).toHaveLength(1);
    expect(cached[0]!.id).toBe("119-hr-1234");
  });

  it("surfaces adapter unavailability with actionable guidance", async () => {
    const db = openMemoryDb();
    const list = async () =>
      ({
        status: "unavailable",
        adapterId: "congressGov",
        reason: "missing apiDataGov key",
        actionable: "set plugins.politiclaw.apiKeys.apiDataGov",
      }) as AdapterResult<Bill[]>;

    const result = await searchBills(db, fakeResolver({ list }), {
      congress: 119,
      billType: "HR",
    });

    expect(result.status).toBe("unavailable");
    if (result.status !== "unavailable") return;
    expect(result.actionable).toContain("apiDataGov");
  });
});

describe("getBillDetail", () => {
  it("stores and returns detail-shape bill fields", async () => {
    const db = openMemoryDb();
    const detailBill: Bill = {
      ...baseBill,
      introducedDate: "2026-01-30",
      policyArea: "Housing and Community Development",
      subjects: ["Affordable housing"],
      summaryText: "This bill authorizes grants to states for ...",
      sponsors: [{ bioguideId: "P000197", fullName: "Rep. Pelosi" }],
    };
    const get = async () =>
      ({
        status: "ok",
        adapterId: "congressGov",
        tier: 1,
        data: detailBill,
        fetchedAt: Date.now(),
      }) as AdapterResult<Bill>;

    const result = await getBillDetail(db, fakeResolver({ get }), {
      congress: 119,
      billType: "HR",
      number: "1234",
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.bill.summaryText).toContain("grants");
    expect(result.bill.subjects).toContain("Affordable housing");
    expect(result.bill.sponsors?.[0]?.bioguideId).toBe("P000197");
  });

  it("re-fetches when only list-shape data is cached", async () => {
    const db = openMemoryDb();
    // Prime cache with list-only fields via searchBills.
    await searchBills(
      db,
      fakeResolver({
        list: async () =>
          ({
            status: "ok",
            adapterId: "congressGov",
            tier: 1,
            data: [baseBill],
            fetchedAt: Date.now(),
          }) as AdapterResult<Bill[]>,
      }),
      { congress: 119, billType: "HR" },
    );

    let detailCalls = 0;
    const result = await getBillDetail(
      db,
      fakeResolver({
        get: async () => {
          detailCalls += 1;
          return {
            status: "ok",
            adapterId: "congressGov",
            tier: 1,
            data: {
              ...baseBill,
              summaryText: "Full summary text.",
              subjects: ["Affordable housing"],
            },
            fetchedAt: Date.now(),
          } as AdapterResult<Bill>;
        },
      }),
      { congress: 119, billType: "HR", number: "1234" },
    );

    expect(detailCalls).toBe(1);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.fromCache).toBe(false);
    expect(result.bill.summaryText).toBe("Full summary text.");
  });
});
