import { Type } from "@sinclair/typebox";
import { describe, expect, it } from "vitest";

import { parse, safeParse } from "./typebox.js";

describe("safeParse", () => {
  it("returns ok=true with the value typed when validation passes", () => {
    const Schema = Type.Object({ name: Type.String() });
    const result = safeParse(Schema, { name: "alec" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.name).toBe("alec");
    }
  });

  it("returns ok=false with formatted path:message strings when validation fails", () => {
    const Schema = Type.Object({
      name: Type.String({ minLength: 1 }),
      age: Type.Integer({ minimum: 0 }),
    });
    const result = safeParse(Schema, { name: "", age: -1 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.messages.length).toBeGreaterThan(0);
      // every message includes a `path:` prefix
      for (const message of result.messages) {
        expect(message).toMatch(/^[^:]+: /);
      }
    }
  });

  it("uses 'value' as the path label for top-level mismatches", () => {
    const Schema = Type.String();
    const result = safeParse(Schema, 42);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.messages[0]).toMatch(/^value: /);
    }
  });
});

describe("parse", () => {
  it("returns the value typed when validation passes", () => {
    const Schema = Type.Object({ kind: Type.Literal("bill") });
    const data = parse(Schema, { kind: "bill" });
    expect(data.kind).toBe("bill");
  });

  it("throws with a joined error message when validation fails", () => {
    const Schema = Type.Object({ name: Type.String({ minLength: 1 }) });
    expect(() => parse(Schema, { name: "" })).toThrow(/Validation failed:/);
  });
});
