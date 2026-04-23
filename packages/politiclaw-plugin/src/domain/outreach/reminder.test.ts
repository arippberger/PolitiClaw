import { beforeEach, describe, expect, it } from "vitest";

import { openMemoryDb, type PolitiClawDb } from "../../storage/sqlite.js";
import { createReminder, listDueReminders, listReminders } from "./reminder.js";

function seedBill(db: PolitiClawDb, id: string): void {
  db.prepare(
    `INSERT INTO bills (id, congress, bill_type, number, title, origin_chamber,
                        latest_action_date, latest_action_text, policy_area,
                        subjects_json, summary_text, source_url,
                        last_synced, source_adapter_id, source_tier, raw)
     VALUES (@id, 119, 'HR', '1', 't', NULL, NULL, NULL, NULL, NULL, NULL, NULL,
             @synced, 'congressGov', 1, '{}')`,
  ).run({ id, synced: Date.now() });
}

describe("createReminder", () => {
  let db: PolitiClawDb;
  beforeEach(() => {
    db = openMemoryDb();
  });

  it("refuses with anchor_not_found when title is empty", () => {
    const result = createReminder(db, {
      title: "   ",
      anchor: { kind: "election", electionDate: "2026-11-03" },
    });
    expect(result.status).toBe("anchor_not_found");
    if (result.status !== "anchor_not_found") return;
    expect(result.reason).toContain("title is required");
  });

  it("refuses with anchor_not_found when the bill anchor doesn't exist", () => {
    const result = createReminder(db, {
      title: "Track HR 1",
      anchor: { kind: "bill", billId: "119-hr-unknown" },
    });
    expect(result.status).toBe("anchor_not_found");
    if (result.status !== "anchor_not_found") return;
    expect(result.reason).toContain("No stored bill");
  });

  it("refuses with a malformed election date", () => {
    const result = createReminder(db, {
      title: "Vote prep",
      anchor: { kind: "election", electionDate: "11-03-2026" },
    });
    expect(result.status).toBe("anchor_not_found");
    if (result.status !== "anchor_not_found") return;
    expect(result.reason).toContain("YYYY-MM-DD");
  });

  it("refuses with an empty event anchor", () => {
    const result = createReminder(db, {
      title: "Track markup",
      anchor: { kind: "event", eventId: "" },
    });
    expect(result.status).toBe("anchor_not_found");
  });

  it("generates the event step template and appends extraSteps verbatim", () => {
    const result = createReminder(db, {
      title: "Track markup",
      deadline: "2026-05-10T14:00:00Z",
      anchor: { kind: "event", eventId: "ev-1" },
      extraSteps: ["Email Rep's district office"],
    });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.reminder.steps[0]).toContain("Note committee meeting on 2026-05-10T14:00:00Z");
    expect(result.reminder.steps).toContain("Confirm rep contact info via politiclaw_get_my_reps.");
    expect(result.reminder.steps.at(-1)).toBe("Email Rep's district office");
    expect(result.reminder.anchorEventId).toBe("ev-1");
  });

  it("generates the election step template including a mail-by date 3 days before", () => {
    const result = createReminder(db, {
      title: "Vote",
      anchor: { kind: "election", electionDate: "2026-11-03" },
    });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.reminder.steps[0]).toBe("Verify polling location and ballot status.");
    expect(result.reminder.steps.some((s) => s.includes("2026-10-31"))).toBe(true);
    expect(result.reminder.steps).toContain(
      "Run politiclaw_prepare_me_for_my_next_election the week of.",
    );
    expect(result.reminder.anchorElectionDate).toBe("2026-11-03");
  });

  it("generates the bill step template when anchored to a stored bill", () => {
    seedBill(db, "119-hr-1");
    const result = createReminder(db, {
      title: "Watch HR 1",
      anchor: { kind: "bill", billId: "119-hr-1" },
    });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.reminder.steps[0]).toContain("Watch for scheduled action on bill 119-hr-1");
    expect(result.reminder.anchorBillId).toBe("119-hr-1");
  });

  it("listReminders returns rows ordered by deadline", () => {
    createReminder(db, {
      title: "A",
      deadline: "2026-12-01",
      anchor: { kind: "election", electionDate: "2026-12-01" },
    });
    createReminder(db, {
      title: "B",
      deadline: "2026-10-01",
      anchor: { kind: "election", electionDate: "2026-10-01" },
    });
    const rows = listReminders(db);
    expect(rows.map((r) => r.title)).toEqual(["B", "A"]);
  });

  it("listDueReminders returns only rows whose deadline falls inside the window", () => {
    const now = Date.parse("2026-04-22T00:00:00Z");
    createReminder(db, {
      title: "near",
      deadline: "2026-04-23T00:00:00Z",
      anchor: { kind: "election", electionDate: "2026-04-23" },
    });
    createReminder(db, {
      title: "far",
      deadline: "2026-12-31T00:00:00Z",
      anchor: { kind: "election", electionDate: "2026-12-31" },
    });
    const due = listDueReminders(db, 48 * 60 * 60 * 1000, now);
    expect(due.map((r) => r.title)).toEqual(["near"]);
  });
});
