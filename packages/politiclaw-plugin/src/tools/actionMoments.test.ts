import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Kv } from "../storage/kv.js";
import {
  resetStorageConfigForTests,
  setStorageForTests,
} from "../storage/context.js";
import { openMemoryDb, type PolitiClawDb } from "../storage/sqlite.js";
import { createActionPackage } from "../domain/actionMoments/index.js";
import { actionMomentsTool } from "./actionMoments.js";

let db: PolitiClawDb;
beforeEach(() => {
  db = openMemoryDb();
  setStorageForTests({ db, kv: new Kv(db) });
});
afterEach(() => {
  resetStorageConfigForTests();
});

function seedOutreachPackage(opts: { decisionHash?: string; issue?: string } = {}) {
  return createActionPackage(db, {
    triggerClass: "bill_nearing_vote",
    packageKind: "outreach",
    outreachMode: "letter",
    billId: "119-hr-1",
    repId: null,
    issue: opts.issue ?? "housing",
    decisionHash: opts.decisionHash ?? "hash-a",
    summary: "HR 1 nearing vote.",
    sourceAdapterId: "congressGov",
    sourceTier: 1,
  });
}

function textOf(result: { content: Array<{ type: string; text?: string }> }): string {
  return (result.content[0] as { type: "text"; text: string }).text;
}

describe("politiclaw_action_moments — action='list'", () => {
  it("returns the empty-state message when nothing is open", async () => {
    const result = await actionMomentsTool.execute!(
      "call-1",
      { action: "list" },
      undefined,
      undefined,
    );
    expect(textOf(result)).toBe("No open action moments.");
    expect(result.details).toMatchObject({ status: "ok", packages: [] });
  });

  it("renders a header line per open package", async () => {
    seedOutreachPackage({ decisionHash: "h1" });
    seedOutreachPackage({ decisionHash: "h2", issue: "climate" });
    const result = await actionMomentsTool.execute!(
      "call-1",
      { action: "list" },
      undefined,
      undefined,
    );
    const text = textOf(result);
    expect(text).toContain("Open action moments:");
    expect(text).toContain("[bill_nearing_vote]");
  });
});

describe("politiclaw_action_moments — action='dismiss'", () => {
  it("returns invalid when packageId is missing", async () => {
    const result = await actionMomentsTool.execute!(
      "call-1",
      { action: "dismiss", verdict: "not_now" },
      undefined,
      undefined,
    );
    expect(result.details).toMatchObject({ status: "invalid" });
    expect(textOf(result)).toContain("'packageId' and 'verdict' are required");
  });

  it("returns invalid when verdict is missing", async () => {
    const result = await actionMomentsTool.execute!(
      "call-1",
      { action: "dismiss", packageId: 1 },
      undefined,
      undefined,
    );
    expect(result.details).toMatchObject({ status: "invalid" });
  });

  it("returns not_found for an unknown packageId", async () => {
    const result = await actionMomentsTool.execute!(
      "call-1",
      { action: "dismiss", packageId: 9999, verdict: "not_now" },
      undefined,
      undefined,
    );
    expect(result.details).toMatchObject({ status: "not_found" });
    expect(textOf(result)).toContain("No action package with id 9999");
  });

  it("records 'useful' feedback with the friendly used message", async () => {
    const pkg = seedOutreachPackage();
    const result = await actionMomentsTool.execute!(
      "call-1",
      { action: "dismiss", packageId: pkg.id, verdict: "useful" },
      undefined,
      undefined,
    );
    expect(textOf(result)).toContain(`Marked package #${pkg.id} as used`);
    expect(result.details).toMatchObject({ status: "ok" });
  });

  it("records 'not_now' feedback", async () => {
    const pkg = seedOutreachPackage();
    const result = await actionMomentsTool.execute!(
      "call-1",
      { action: "dismiss", packageId: pkg.id, verdict: "not_now" },
      undefined,
      undefined,
    );
    expect(textOf(result)).toContain("hiding this one for now");
  });

  it("records 'stop' feedback", async () => {
    const pkg = seedOutreachPackage();
    const result = await actionMomentsTool.execute!(
      "call-1",
      { action: "dismiss", packageId: pkg.id, verdict: "stop" },
      undefined,
      undefined,
    );
    expect(textOf(result)).toContain("won't offer this one again");
  });
});

describe("politiclaw_action_moments — invalid action", () => {
  it("returns invalid when action is missing", async () => {
    const result = await actionMomentsTool.execute!("call-1", {}, undefined, undefined);
    expect(result.details).toMatchObject({ status: "invalid" });
  });
});
