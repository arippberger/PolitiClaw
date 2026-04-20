import { beforeEach, describe, expect, it } from "vitest";
import { openMemoryDb } from "../../storage/sqlite.js";
import {
  canonicalize,
  detectChange,
  HashInputVersion,
  readSnapshot,
  type ChangeDetectionInput,
} from "./changeDetection.js";

const SOURCE = { adapterId: "congressGov", tier: 1 };

function input(overrides: Partial<ChangeDetectionInput> = {}): ChangeDetectionInput {
  return {
    kind: "bill",
    id: "119-hr-1234",
    hashInput: { latestActionDate: "2026-04-10", latestActionText: "Referred" },
    source: SOURCE,
    ...overrides,
  };
}

let db: ReturnType<typeof openMemoryDb>;

beforeEach(() => {
  db = openMemoryDb();
});

describe("detectChange", () => {
  it("reports 'new' on first sight and persists the row", () => {
    const result = detectChange(db, input());
    expect(result.changed).toBe(true);
    expect(result.reason).toBe("new");
    expect(result.previousHash).toBeNull();

    const stored = readSnapshot(db, "bill", "119-hr-1234");
    expect(stored).not.toBeNull();
    expect(stored?.contentHash).toBe(result.currentHash);
    expect(stored?.hashInputVersion).toBe(HashInputVersion.bill);
    expect(stored?.sourceAdapterId).toBe("congressGov");
    expect(stored?.sourceTier).toBe(1);
  });

  it("reports 'unchanged' when payload matches and does NOT move last_changed_at", async () => {
    const first = detectChange(db, input());
    await sleep(5);
    const second = detectChange(db, input());

    expect(second.changed).toBe(false);
    expect(second.reason).toBe("unchanged");
    expect(second.lastChangedAt).toBe(first.lastChangedAt);

    const stored = readSnapshot(db, "bill", "119-hr-1234")!;
    expect(stored.lastChangedAt).toBe(first.lastChangedAt);
    expect(stored.lastSeenAt).toBeGreaterThanOrEqual(first.lastChangedAt);
  });

  it("reports 'changed' when payload differs and moves last_changed_at forward", async () => {
    const first = detectChange(db, input());
    await sleep(5);
    const second = detectChange(
      db,
      input({ hashInput: { latestActionDate: "2026-04-11", latestActionText: "Passed House" } }),
    );

    expect(second.changed).toBe(true);
    expect(second.reason).toBe("changed");
    expect(second.previousHash).toBe(first.currentHash);
    expect(second.currentHash).not.toBe(first.currentHash);
    expect(second.lastChangedAt).toBeGreaterThan(first.lastChangedAt);

    const stored = readSnapshot(db, "bill", "119-hr-1234")!;
    expect(stored.contentHash).toBe(second.currentHash);
  });

  it("is hash-stable regardless of object key order in the payload", () => {
    const first = detectChange(db, input({ hashInput: { a: 1, b: 2, nested: { y: 2, x: 1 } } }));
    const second = detectChange(db, input({ hashInput: { nested: { x: 1, y: 2 }, b: 2, a: 1 } }));
    expect(second.reason).toBe("unchanged");
    expect(second.currentHash).toBe(first.currentHash);
  });

  it("treats ['sponsor-a', 'sponsor-b'] and ['sponsor-b', 'sponsor-a'] as different (array order is meaningful)", () => {
    const first = detectChange(db, input({ hashInput: { sponsors: ["a", "b"] } }));
    const second = detectChange(db, input({ hashInput: { sponsors: ["b", "a"] } }));
    expect(second.changed).toBe(true);
    expect(second.reason).toBe("changed");
    expect(second.currentHash).not.toBe(first.currentHash);
  });

  it("reports 'schema_bump' (changed=true) when hash_input_version drifts and rewrites the row", () => {
    const first = detectChange(db, input());
    db.prepare(
      `UPDATE snapshots SET hash_input_version = 0 WHERE entity_kind = 'bill' AND entity_id = '119-hr-1234'`,
    ).run();

    const result = detectChange(db, input());
    expect(result.changed).toBe(true);
    expect(result.reason).toBe("schema_bump");

    const stored = readSnapshot(db, "bill", "119-hr-1234")!;
    expect(stored.hashInputVersion).toBe(HashInputVersion.bill);
    expect(stored.firstSeenAt).toBe(first.firstSeenAt);
  });

  it("scopes by entity_kind — same id across kinds is independent", () => {
    const a = detectChange(db, input({ kind: "bill", id: "shared" }));
    const b = detectChange(db, input({ kind: "committee_meeting", id: "shared" }));
    expect(a.reason).toBe("new");
    expect(b.reason).toBe("new");

    const billAgain = detectChange(db, input({ kind: "bill", id: "shared" }));
    expect(billAgain.reason).toBe("unchanged");
    const meetingAgain = detectChange(db, input({ kind: "committee_meeting", id: "shared" }));
    expect(meetingAgain.reason).toBe("unchanged");
  });

  it("carries adapter/tier provenance through to the stored row", () => {
    detectChange(db, input({ source: { adapterId: "houseGov", tier: 3 } }));
    const stored = readSnapshot(db, "bill", "119-hr-1234")!;
    expect(stored.sourceAdapterId).toBe("houseGov");
    expect(stored.sourceTier).toBe(3);
  });
});

describe("canonicalize", () => {
  it("drops undefined and sorts object keys recursively", () => {
    expect(
      canonicalize({ b: 1, a: { d: undefined, c: 3, b: 2 }, c: undefined }),
    ).toBe('{"a":{"b":2,"c":3},"b":1}');
  });

  it("preserves array order", () => {
    expect(canonicalize(["b", "a"])).toBe('["b","a"]');
  });
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
