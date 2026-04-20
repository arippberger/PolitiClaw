import { describe, expect, it } from "vitest";
import { openMemoryDb } from "./sqlite.js";
import { Kv } from "./kv.js";

describe("Kv", () => {
  it("round-trips primitives and objects", () => {
    const kv = new Kv(openMemoryDb());
    kv.set("onboarding:completed", true);
    kv.set("lastPoll:bills", 1700000000000);
    kv.set("rateLimit:congressGov", { remaining: 4999, resetAt: 1700000003600 });

    expect(kv.get<boolean>("onboarding:completed")).toBe(true);
    expect(kv.get<number>("lastPoll:bills")).toBe(1700000000000);
    expect(kv.get<{ remaining: number; resetAt: number }>("rateLimit:congressGov")).toEqual({
      remaining: 4999,
      resetAt: 1700000003600,
    });
  });

  it("returns undefined for missing keys", () => {
    const kv = new Kv(openMemoryDb());
    expect(kv.get("missing")).toBeUndefined();
  });

  it("overwrites existing values", () => {
    const kv = new Kv(openMemoryDb());
    kv.set("k", "a");
    kv.set("k", "b");
    expect(kv.get("k")).toBe("b");
  });

  it("delete removes the key", () => {
    const kv = new Kv(openMemoryDb());
    kv.set("k", 1);
    kv.delete("k");
    expect(kv.get("k")).toBeUndefined();
  });
});
