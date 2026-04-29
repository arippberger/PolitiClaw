import { beforeEach, describe, expect, it } from "vitest";

import { openMemoryDb, type PolitiClawDb } from "../../storage/sqlite.js";
import { upsertIssueStance } from "../preferences/index.js";
import {
  CALL_SCRIPT_MAX_WORDS,
  draftCallScript,
  listCallScripts,
} from "./callScript.js";

function seedRep(
  db: PolitiClawDb,
  opts: {
    id: string;
    name: string;
    office: "US Senate" | "US House";
    state?: string;
    district?: string;
    phone?: string;
    url?: string;
  },
): void {
  const contact: Record<string, string> = {};
  if (opts.phone) contact.phone = opts.phone;
  if (opts.url) contact.url = opts.url;
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
    contact: Object.keys(contact).length > 0 ? JSON.stringify(contact) : null,
    synced: Date.now(),
  });
}

describe("draftCallScript", () => {
  let db: PolitiClawDb;
  beforeEach(() => {
    db = openMemoryDb();
  });

  it("returns rep_not_found when no rep matches", async () => {
    upsertIssueStance(db, { issue: "housing", stance: "support", weight: 3 });
    const result = await draftCallScript(db, { repId: "UNKNOWN", issue: "housing" });
    expect(result.status).toBe("rep_not_found");
    if (result.status !== "rep_not_found") return;
    expect(result.actionable).toContain("politiclaw_get_my_reps");
  });

  it("returns no_stance_for_issue when no stance is declared", async () => {
    seedRep(db, { id: "P1", name: "Jane Rep", office: "US House", state: "CA", district: "11", phone: "202-555-0100" });
    const result = await draftCallScript(db, { repId: "P1", issue: "climate" });
    expect(result.status).toBe("no_stance_for_issue");
    if (result.status !== "no_stance_for_issue") return;
    expect(result.actionable).toContain("politiclaw_issue_stances");
  });

  it("returns no_stance_for_issue when stance is neutral", async () => {
    seedRep(db, { id: "P1", name: "Jane Rep", office: "US House", state: "CA", district: "11", phone: "202-555-0100" });
    upsertIssueStance(db, { issue: "housing", stance: "neutral", weight: 1 });
    const result = await draftCallScript(db, { repId: "P1", issue: "housing" });
    expect(result.status).toBe("no_stance_for_issue");
    if (result.status !== "no_stance_for_issue") return;
    expect(result.reason).toContain("neutral");
  });

  it("returns no_phone_on_file when rep has no phone, surfacing their site", async () => {
    seedRep(db, {
      id: "P1",
      name: "Jane Rep",
      office: "US House",
      state: "CA",
      district: "11",
      url: "https://rep.house.gov",
    });
    upsertIssueStance(db, { issue: "housing", stance: "support", weight: 3 });
    const result = await draftCallScript(db, { repId: "P1", issue: "housing" });
    expect(result.status).toBe("no_phone_on_file");
    if (result.status !== "no_phone_on_file") return;
    expect(result.actionable).toContain("https://rep.house.gov");
  });

  it("slot-fills a support script with opening, ask, and closing lines", async () => {
    seedRep(db, {
      id: "P1",
      name: "Nancy Pelosi",
      office: "US House",
      state: "CA",
      district: "11",
      phone: "202-555-0100",
    });
    upsertIssueStance(db, { issue: "affordable-housing", stance: "support", weight: 4 });
    const result = await draftCallScript(db, { repId: "P1", issue: "affordable-housing" });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.openingLine).toContain("Hi, my name is [Your name]");
    expect(result.openingLine).toContain("CA-11");
    expect(result.openingLine).toContain("affordable housing");
    expect(result.askLine).toContain("Representative Pelosi");
    expect(result.askLine).toContain("support stronger action");
    expect(result.closingLine).toContain("Pelosi's position");
    expect(result.phoneNumber).toBe("202-555-0100");
    expect(result.wordCount).toBeLessThanOrEqual(CALL_SCRIPT_MAX_WORDS);
  });

  it("slot-fills an oppose script with mirrored ask phrasing", async () => {
    seedRep(db, {
      id: "S1",
      name: "Alex Padilla",
      office: "US Senate",
      state: "CA",
      phone: "202-555-0200",
    });
    upsertIssueStance(db, { issue: "surveillance", stance: "oppose", weight: 5 });
    const result = await draftCallScript(db, { repId: "S1", issue: "surveillance" });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.askLine).toContain("Senator Padilla");
    expect(result.askLine).toContain("oppose the current direction");
    expect(result.openingLine).toContain("constituent from CA");
  });

  it("appends a custom oneSpecificSentence verbatim", async () => {
    seedRep(db, { id: "P1", name: "Jane Rep", office: "US House", state: "CA", district: "11", phone: "202-555-0100" });
    upsertIssueStance(db, { issue: "housing", stance: "support", weight: 3 });
    const result = await draftCallScript(db, {
      repId: "P1",
      issue: "housing",
      oneSpecificSentence: "My family has been on a wait list for 14 months.",
    });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.oneSpecificLine).toBe("My family has been on a wait list for 14 months.");
    expect(result.script).toContain("My family has been on a wait list for 14 months.");
  });

  it("returns bill_unavailable when billId supplied but no resolver wired", async () => {
    seedRep(db, { id: "P1", name: "Jane Rep", office: "US House", state: "CA", district: "11", phone: "202-555-0100" });
    upsertIssueStance(db, { issue: "housing", stance: "support", weight: 3 });
    const result = await draftCallScript(db, {
      repId: "P1",
      issue: "housing",
      billId: "119-hr-1234",
    });
    expect(result.status).toBe("bill_unavailable");
    if (result.status !== "bill_unavailable") return;
    expect(result.reason).toContain("no bills resolver");
  });

  it("returns bill_unavailable for a malformed bill id", async () => {
    seedRep(db, { id: "P1", name: "Jane Rep", office: "US House", state: "CA", district: "11", phone: "202-555-0100" });
    upsertIssueStance(db, { issue: "housing", stance: "support", weight: 3 });
    const result = await draftCallScript(db, {
      repId: "P1",
      issue: "housing",
      billId: "not-a-bill",
    });
    expect(result.status).toBe("bill_unavailable");
    if (result.status !== "bill_unavailable") return;
    expect(result.reason).toContain("Could not parse");
  });

  it("persists the script and surfaces it via listCallScripts", async () => {
    seedRep(db, { id: "P1", name: "Jane Rep", office: "US House", state: "CA", district: "11", phone: "202-555-0100" });
    upsertIssueStance(db, { issue: "housing", stance: "support", weight: 3 });
    const result = await draftCallScript(db, { repId: "P1", issue: "housing" });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;

    const rows = listCallScripts(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(result.callScriptId);
    expect(rows[0]!.repId).toBe("P1");
    expect(rows[0]!.issue).toBe("housing");
    expect(rows[0]!.phoneNumber).toBe("202-555-0100");
  });

  it("normalizes the issue input (whitespace + case) before matching stances", async () => {
    seedRep(db, { id: "P1", name: "Jane Rep", office: "US House", state: "CA", district: "11", phone: "202-555-0100" });
    upsertIssueStance(db, { issue: "affordable-housing", stance: "support", weight: 3 });
    const result = await draftCallScript(db, {
      repId: "P1",
      issue: "Affordable Housing",
    });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.issue).toBe("affordable-housing");
  });
});
