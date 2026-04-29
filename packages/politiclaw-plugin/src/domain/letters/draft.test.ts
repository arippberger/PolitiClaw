import { beforeEach, describe, expect, it } from "vitest";

import {
  draftLetter,
  listLetters,
  requestLetterRedraft,
  LETTER_MAX_WORDS,
} from "./draft.js";
import { createBillsResolver } from "../../sources/bills/index.js";
import type { AdapterResult } from "../../sources/common/types.js";
import type { Bill, BillRef } from "../../sources/bills/types.js";
import { upsertIssueStance } from "../preferences/index.js";
import { openMemoryDb, type PolitiClawDb } from "../../storage/sqlite.js";

function seedRep(
  db: PolitiClawDb,
  opts: {
    id: string;
    name: string;
    office: "US Senate" | "US House";
    state?: string;
    district?: string;
    url?: string;
  },
): void {
  db.prepare(
    `INSERT INTO reps (id, name, office, party, jurisdiction, district, state, contact,
                       last_synced, source_adapter_id, source_tier, raw)
     VALUES (@id, @name, @office, 'D', @juris, @district, @state, @contact,
             @synced, 'geocodio', 2, '{}')`,
  ).run({
    id: opts.id,
    name: opts.name,
    office: opts.office,
    juris: opts.state ? `US-${opts.state}` : null,
    district: opts.district ?? null,
    state: opts.state ?? null,
    contact: opts.url ? JSON.stringify({ url: opts.url }) : null,
    synced: Date.now(),
  });
}

function seedBill(db: PolitiClawDb, bill: Bill): void {
  db.prepare(
    `INSERT INTO bills (id, congress, bill_type, number, title, origin_chamber,
                        latest_action_date, latest_action_text, policy_area,
                        subjects_json, summary_text, source_url,
                        last_synced, source_adapter_id, source_tier, raw)
     VALUES (@id, @congress, @billType, @number, @title, @originChamber,
             @latestActionDate, @latestActionText, @policyArea, @subjects,
             @summaryText, @sourceUrl, @synced, 'congressGov', 1, '{}')`,
  ).run({
    id: bill.id,
    congress: bill.congress,
    billType: bill.billType,
    number: bill.number,
    title: bill.title,
    originChamber: bill.originChamber ?? null,
    latestActionDate: bill.latestActionDate ?? null,
    latestActionText: bill.latestActionText ?? null,
    policyArea: bill.policyArea ?? null,
    subjects: bill.subjects ? JSON.stringify(bill.subjects) : null,
    summaryText: bill.summaryText ?? null,
    sourceUrl: bill.sourceUrl ?? null,
    synced: Date.now(),
  });
}

function fakeResolver(get: (ref: BillRef) => Promise<AdapterResult<Bill>>) {
  const resolver = createBillsResolver({ apiDataGovKey: "k" });
  resolver.get = get;
  return resolver;
}

describe("draftLetter", () => {
  let db: PolitiClawDb;
  beforeEach(() => {
    db = openMemoryDb();
  });

  it("refuses when no rep matches the id", async () => {
    upsertIssueStance(db, { issue: "housing", stance: "support", weight: 4 });
    const result = await draftLetter(db, { repId: "UNKNOWN", issue: "housing" });
    expect(result.status).toBe("rep_not_found");
    if (result.status !== "rep_not_found") return;
    expect(result.actionable).toContain("politiclaw_get_my_reps");
  });

  it("refuses when no declared stance on the issue", async () => {
    seedRep(db, { id: "P000197", name: "Nancy Pelosi", office: "US House", state: "CA", district: "11" });
    const result = await draftLetter(db, { repId: "P000197", issue: "climate" });
    expect(result.status).toBe("no_stance_for_issue");
    if (result.status !== "no_stance_for_issue") return;
    expect(result.actionable).toContain("politiclaw_issue_stances");
  });

  it("refuses when declared stance is neutral", async () => {
    seedRep(db, { id: "P000197", name: "Nancy Pelosi", office: "US House", state: "CA", district: "11" });
    upsertIssueStance(db, { issue: "housing", stance: "neutral", weight: 1 });
    const result = await draftLetter(db, { repId: "P000197", issue: "housing" });
    expect(result.status).toBe("no_stance_for_issue");
    if (result.status !== "no_stance_for_issue") return;
    expect(result.reason).toContain("neutral");
  });

  it("drafts an issue-only letter when no bill is supplied", async () => {
    seedRep(db, {
      id: "P000197",
      name: "Nancy Pelosi",
      office: "US House",
      state: "CA",
      district: "11",
      url: "https://pelosi.house.gov",
    });
    upsertIssueStance(db, { issue: "affordable-housing", stance: "support", weight: 4 });

    const result = await draftLetter(db, { repId: "P000197", issue: "affordable-housing" });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;

    expect(result.body).toContain("Dear Representative Pelosi,");
    expect(result.body).toContain("a constituent from CA-11");
    expect(result.body).toContain("affordable housing");
    expect(result.body).toContain("in support of stronger action on affordable housing");
    expect(result.body).toContain("[Your name]");
    expect(result.subject).toContain("affordable housing");
    expect(result.subject).toContain("CA-11");
    expect(result.citations).toHaveLength(1);
    expect(result.citations[0]!.url).toBe("https://pelosi.house.gov");
    expect(result.wordCount).toBeGreaterThan(40);
    expect(result.wordCount).toBeLessThanOrEqual(LETTER_MAX_WORDS);

    expect(result.body).not.toContain("About the bill");
    expect(result.body).not.toContain("congress.gov/bill");
  });

  it("drafts an oppose-framed letter with an opening ask for the rep's position", async () => {
    seedRep(db, { id: "S000001", name: "Jane Senator", office: "US Senate", state: "WA" });
    upsertIssueStance(db, { issue: "surveillance", stance: "oppose", weight: 5 });

    const result = await draftLetter(db, { repId: "S000001", issue: "surveillance" });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.body).toContain("Dear Senator Senator,");
    expect(result.body).toContain("in opposition to the current direction of policy on surveillance");
    expect(result.body).toContain("If legislation on this topic comes before you");
  });

  it("cites the bill when billId is supplied, via the bills resolver", async () => {
    seedRep(db, {
      id: "P000197",
      name: "Nancy Pelosi",
      office: "US House",
      state: "CA",
      district: "11",
      url: "https://pelosi.house.gov",
    });
    upsertIssueStance(db, { issue: "housing", stance: "support", weight: 3 });
    const bill: Bill = {
      id: "119-hr-1234",
      congress: 119,
      billType: "HR",
      number: "1234",
      title: "Clean Housing Investment Act of 2026",
      latestActionDate: "2026-04-01",
      latestActionText: "Referred to the Committee on Financial Services.",
    };

    const resolver = fakeResolver(async (ref) => {
      expect(ref).toEqual({ congress: 119, billType: "HR", number: "1234" });
      return {
        status: "ok",
        adapterId: "congressGov",
        tier: 1,
        data: bill,
        fetchedAt: Date.now(),
      };
    });

    const result = await draftLetter(
      db,
      { repId: "P000197", issue: "housing", billId: "119-hr-1234" },
      { resolver },
    );

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.body).toContain("HR 1234 — Clean Housing Investment Act of 2026");
    expect(result.body).toContain("2026-04-01: Referred to the Committee on Financial Services.");
    expect(result.body).toContain("https://www.congress.gov/bill/119/house-bill/1234");
    expect(result.body).toContain("I would appreciate a direct statement of your position on this bill");
    expect(result.citations.map((c) => c.label)).toContain("HR 1234 on congress.gov");
    expect(result.subject).toContain("HR 1234");
  });

  it("appends a custom note verbatim when supplied", async () => {
    seedRep(db, { id: "P000197", name: "Nancy Pelosi", office: "US House", state: "CA", district: "11" });
    upsertIssueStance(db, { issue: "housing", stance: "support", weight: 3 });
    const result = await draftLetter(db, {
      repId: "P000197",
      issue: "housing",
      customNote: "My family has been on a housing wait list for 14 months.",
    });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.body).toContain("My family has been on a housing wait list for 14 months.");
  });

  it("returns bill_unavailable when billId is supplied but no resolver is wired", async () => {
    seedRep(db, { id: "P000197", name: "Nancy Pelosi", office: "US House", state: "CA", district: "11" });
    upsertIssueStance(db, { issue: "housing", stance: "support", weight: 3 });
    const result = await draftLetter(db, {
      repId: "P000197",
      issue: "housing",
      billId: "119-hr-1234",
    });
    expect(result.status).toBe("bill_unavailable");
    if (result.status !== "bill_unavailable") return;
    expect(result.reason).toContain("no bills resolver");
  });

  it("returns bill_unavailable when the bill id is malformed", async () => {
    seedRep(db, { id: "P000197", name: "Nancy Pelosi", office: "US House", state: "CA", district: "11" });
    upsertIssueStance(db, { issue: "housing", stance: "support", weight: 3 });
    const resolver = fakeResolver(async () => ({
      status: "ok",
      adapterId: "congressGov",
      tier: 1,
      data: {
        id: "119-hr-1",
        congress: 119,
        billType: "HR",
        number: "1",
        title: "t",
      },
      fetchedAt: Date.now(),
    }));
    const result = await draftLetter(
      db,
      { repId: "P000197", issue: "housing", billId: "not-a-bill" },
      { resolver },
    );
    expect(result.status).toBe("bill_unavailable");
    if (result.status !== "bill_unavailable") return;
    expect(result.reason).toContain("Could not parse");
  });

  it("passes through resolver unavailable as bill_unavailable", async () => {
    seedRep(db, { id: "P000197", name: "Nancy Pelosi", office: "US House", state: "CA", district: "11" });
    upsertIssueStance(db, { issue: "housing", stance: "support", weight: 3 });
    const resolver = fakeResolver(async () => ({
      status: "unavailable",
      adapterId: "congressGov",
      reason: "api.data.gov returned 403",
      actionable: "check the key",
    }));
    const result = await draftLetter(
      db,
      { repId: "P000197", issue: "housing", billId: "119-hr-1234" },
      { resolver },
    );
    expect(result.status).toBe("bill_unavailable");
    if (result.status !== "bill_unavailable") return;
    expect(result.reason).toContain("api.data.gov returned 403");
    expect(result.actionable).toBe("check the key");
  });

  it("persists the letter and surfaces it via listLetters", async () => {
    seedRep(db, { id: "P000197", name: "Nancy Pelosi", office: "US House", state: "CA", district: "11" });
    upsertIssueStance(db, { issue: "housing", stance: "support", weight: 3 });

    const nowStub = () => 1_700_000_000_000;
    const result = await draftLetter(
      db,
      { repId: "P000197", issue: "housing" },
      { now: nowStub },
    );
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;

    const rows = listLetters(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(result.letterId);
    expect(rows[0]!.repId).toBe("P000197");
    expect(rows[0]!.issue).toBe("housing");
    expect(rows[0]!.createdAt).toBe(1_700_000_000_000);
    expect(rows[0]!.subject).toBe(result.subject);
  });

  it("normalizes the issue input (whitespace + case) before matching stances", async () => {
    seedRep(db, { id: "P000197", name: "Nancy Pelosi", office: "US House", state: "CA", district: "11" });
    upsertIssueStance(db, { issue: "affordable-housing", stance: "support", weight: 3 });
    const result = await draftLetter(db, {
      repId: "P000197",
      issue: "Affordable Housing",
    });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.issue).toBe("affordable-housing");
  });

  it("finds a senator's contact URL when present", async () => {
    seedRep(db, {
      id: "P000145",
      name: "Alex Padilla",
      office: "US Senate",
      state: "CA",
      url: "https://www.padilla.senate.gov",
    });
    upsertIssueStance(db, { issue: "immigration", stance: "support", weight: 4 });
    const result = await draftLetter(db, { repId: "P000145", issue: "immigration" });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.body).toContain("Dear Senator Padilla,");
    expect(result.body).toContain("a constituent from CA");
    expect(result.citations[0]!.url).toBe("https://www.padilla.senate.gov");
  });

  it("produces no citation block when the stored rep has no contact URL and no bill is supplied", async () => {
    seedRep(db, { id: "SYN-1", name: "District Rep", office: "US House", state: "TX", district: "5" });
    upsertIssueStance(db, { issue: "energy", stance: "support", weight: 2 });
    const result = await draftLetter(db, { repId: "SYN-1", issue: "energy" });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.citations).toHaveLength(0);
  });

  it("uses cached bill details and does not re-fetch", async () => {
    seedRep(db, { id: "P000197", name: "Nancy Pelosi", office: "US House", state: "CA", district: "11" });
    upsertIssueStance(db, { issue: "housing", stance: "support", weight: 3 });
    seedBill(db, {
      id: "119-hr-1234",
      congress: 119,
      billType: "HR",
      number: "1234",
      title: "Cached Housing Bill",
      latestActionDate: "2026-04-10",
      latestActionText: "Passed House.",
      summaryText: "summary",
      subjects: ["Housing"],
    });

    let resolverCalls = 0;
    const resolver = fakeResolver(async () => {
      resolverCalls += 1;
      throw new Error("should not be called — cache should hit");
    });

    const result = await draftLetter(
      db,
      { repId: "P000197", issue: "housing", billId: "119-hr-1234" },
      { resolver },
    );

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(resolverCalls).toBe(0);
    expect(result.body).toContain("Cached Housing Bill");
    expect(result.bill?.title).toBe("Cached Housing Bill");
  });
});

describe("requestLetterRedraft", () => {
  let db: PolitiClawDb;
  beforeEach(() => {
    db = openMemoryDb();
  });

  function seedStoredLetter(): number {
    seedRep(db, {
      id: "P000197",
      name: "Nancy Pelosi",
      office: "US House",
      state: "CA",
      district: "11",
      url: "https://pelosi.house.gov",
    });
    upsertIssueStance(db, { issue: "housing", stance: "support", weight: 3 });
    const result = db
      .prepare(
        `INSERT INTO letters (rep_id, rep_name, rep_office, issue, bill_id, subject, body,
                              citations_json, stance_snapshot_hash, word_count, created_at)
         VALUES ('P000197', 'Nancy Pelosi', 'US House', 'housing', NULL,
                 'Subj', 'body', '[]', 'hash', 42, ?)`,
      )
      .run(Date.now());
    return Number(result.lastInsertRowid);
  }

  it("stamps redraft_requested_at and returns it on the result", () => {
    const letterId = seedStoredLetter();
    const frozenNow = 1_777_000_000_000;
    const result = requestLetterRedraft(db, letterId, frozenNow);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.redraftRequestedAt).toBe(frozenNow);

    const listed = listLetters(db);
    expect(listed[0]!.redraftRequestedAt).toBe(frozenNow);
  });

  it("returns not_found when the id does not exist", () => {
    const result = requestLetterRedraft(db, 9999);
    expect(result.status).toBe("not_found");
  });

  it("is idempotent — a second call overwrites with the newer timestamp", () => {
    const letterId = seedStoredLetter();
    requestLetterRedraft(db, letterId, 1_000);
    const second = requestLetterRedraft(db, letterId, 2_000);
    expect(second.status).toBe("ok");
    if (second.status !== "ok") return;
    expect(second.redraftRequestedAt).toBe(2_000);
  });
});
