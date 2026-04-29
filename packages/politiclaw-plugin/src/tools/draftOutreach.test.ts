import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { openMemoryDb, type PolitiClawDb } from "../storage/sqlite.js";
import { Kv } from "../storage/kv.js";
import {
  configureStorage,
  resetStorageConfigForTests,
  setPluginConfigForTests,
  setStorageForTests,
} from "../storage/context.js";
import { upsertIssueStance } from "../domain/preferences/index.js";
import { draftOutreachTool } from "./draftOutreach.js";

function withMemoryStorage(): PolitiClawDb {
  const db = openMemoryDb();
  configureStorage(() => "/tmp/politiclaw-tests");
  setStorageForTests({ db, kv: new Kv(db) });
  return db;
}

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

function textOf(result: { content: Array<{ type: string; text?: string }> }): string {
  const first = result.content[0] as { type: "text"; text: string };
  return first.text;
}

let db: PolitiClawDb;
beforeEach(() => {
  db = withMemoryStorage();
  setPluginConfigForTests({ apiKeys: {} });
});
afterEach(() => {
  resetStorageConfigForTests();
});

describe("politiclaw_draft_outreach — format='letter'", () => {
  it("refuses with actionable guidance when rep is not found", async () => {
    upsertIssueStance(db, { issue: "housing", stance: "support", weight: 3 });
    const result = await draftOutreachTool.execute!(
      "call-1",
      { format: "letter", repId: "MISSING", issue: "housing" },
      undefined,
      undefined,
    );
    const text = textOf(result);
    expect(text).toContain("Cannot draft");
    expect(text).toContain("politiclaw_get_my_reps");
  });

  it("refuses when there is no declared stance on the issue", async () => {
    seedRep(db, { id: "P000197", name: "Nancy Pelosi", office: "US House", state: "CA", district: "11" });
    const result = await draftOutreachTool.execute!(
      "call-1",
      { format: "letter", repId: "P000197", issue: "housing" },
      undefined,
      undefined,
    );
    const text = textOf(result);
    expect(text).toContain("Cannot draft");
    expect(text).toContain("politiclaw_issue_stances");
  });

  it("renders subject, body, citations, word count, and the draft disclaimer", async () => {
    seedRep(db, {
      id: "P000197",
      name: "Nancy Pelosi",
      office: "US House",
      state: "CA",
      district: "11",
      url: "https://pelosi.house.gov",
    });
    upsertIssueStance(db, { issue: "affordable-housing", stance: "support", weight: 4 });

    const result = await draftOutreachTool.execute!(
      "call-1",
      { format: "letter", repId: "P000197", issue: "affordable-housing" },
      undefined,
      undefined,
    );
    const text = textOf(result);

    expect(text).toContain("Draft letter #");
    expect(text).toContain("Nancy Pelosi (US House)");
    expect(text).toContain("Subject:");
    expect(text).toContain("Dear Representative Pelosi,");
    expect(text).toContain("Citations:");
    expect(text).toContain("pelosi.house.gov");
    expect(text).toContain("tier 2");
    expect(text).toContain("under 400");
    expect(text).toContain("This is a draft.");
  });

  it("surfaces a bill_unavailable message when billId is passed without an apiDataGov key", async () => {
    seedRep(db, { id: "P000197", name: "Nancy Pelosi", office: "US House", state: "CA", district: "11" });
    upsertIssueStance(db, { issue: "housing", stance: "support", weight: 3 });

    const result = await draftOutreachTool.execute!(
      "call-1",
      { format: "letter", repId: "P000197", issue: "housing", billId: "119-hr-1234" },
      undefined,
      undefined,
    );
    const text = textOf(result);
    expect(text).toContain("Cannot draft");
    expect(text.toLowerCase()).toContain("apidatagov");
  });

  it("rejects oneSpecificSentence when format='letter'", async () => {
    seedRep(db, { id: "P000197", name: "Nancy Pelosi", office: "US House", state: "CA", district: "11" });
    upsertIssueStance(db, { issue: "housing", stance: "support", weight: 3 });

    const result = await draftOutreachTool.execute!(
      "call-1",
      {
        format: "letter",
        repId: "P000197",
        issue: "housing",
        oneSpecificSentence: "should not be here",
      },
      undefined,
      undefined,
    );
    const text = textOf(result);
    expect(text).toContain("Invalid input");
    expect(text).toContain("oneSpecificSentence");
  });
});

describe("politiclaw_draft_outreach — format='call'", () => {
  it("refuses with actionable guidance when rep is not found", async () => {
    upsertIssueStance(db, { issue: "housing", stance: "support", weight: 3 });
    const result = await draftOutreachTool.execute!(
      "call-1",
      { format: "call", repId: "MISSING", issue: "housing" },
      undefined,
      undefined,
    );
    const text = textOf(result);
    expect(text).toContain("Cannot draft");
    expect(text).toContain("politiclaw_get_my_reps");
  });

  it("renders header, phone, and disclaimer when ok", async () => {
    seedRep(db, {
      id: "P1",
      name: "Nancy Pelosi",
      office: "US House",
      state: "CA",
      district: "11",
      phone: "202-555-0100",
    });
    upsertIssueStance(db, { issue: "affordable-housing", stance: "support", weight: 4 });

    const result = await draftOutreachTool.execute!(
      "call-1",
      { format: "call", repId: "P1", issue: "affordable-housing" },
      undefined,
      undefined,
    );
    const text = textOf(result);
    expect(text).toContain("Call script #");
    expect(text).toContain("Nancy Pelosi (US House)");
    expect(text).toContain("Phone: 202-555-0100");
    expect(text.toLowerCase()).toContain("draft");
  });

  it("rejects customNote when format='call'", async () => {
    seedRep(db, {
      id: "P1",
      name: "Nancy Pelosi",
      office: "US House",
      state: "CA",
      district: "11",
      phone: "202-555-0100",
    });
    upsertIssueStance(db, { issue: "housing", stance: "support", weight: 3 });

    const result = await draftOutreachTool.execute!(
      "call-1",
      {
        format: "call",
        repId: "P1",
        issue: "housing",
        customNote: "should not be here",
      },
      undefined,
      undefined,
    );
    const text = textOf(result);
    expect(text).toContain("Invalid input");
    expect(text).toContain("customNote");
  });

  it("reports invalid input when required fields are missing", async () => {
    const result = await draftOutreachTool.execute!("call-1", {}, undefined, undefined);
    const text = textOf(result);
    expect(text).toContain("Invalid input");
  });
});
