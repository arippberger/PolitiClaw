import type { IncomingMessage } from "node:http";
import { Readable } from "node:stream";

import { describe, expect, it } from "vitest";

import { MAX_JSON_BODY_BYTES, readJsonBody } from "./body.js";

function makeReq(body: string | Buffer, contentType = "application/json"): IncomingMessage {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body, "utf8");
  const readable = Readable.from([buf]);
  const req = readable as unknown as IncomingMessage & { headers: Record<string, string> };
  req.headers = { "content-type": contentType };
  return req;
}

describe("readJsonBody", () => {
  it("parses a valid JSON object", async () => {
    const req = makeReq(JSON.stringify({ hello: "world" }));
    const result = await readJsonBody(req);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual({ hello: "world" });
  });

  it("returns {} for empty bodies", async () => {
    const req = makeReq("");
    const result = await readJsonBody(req);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual({});
  });

  it("returns {} for whitespace-only bodies", async () => {
    const req = makeReq("   \n  ");
    const result = await readJsonBody(req);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual({});
  });

  it("rejects with 400 on malformed JSON", async () => {
    const req = makeReq("{not json");
    const result = await readJsonBody(req);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.reason).toMatch(/invalid JSON/i);
    }
  });

  it("rejects non-JSON content types with 415", async () => {
    const req = makeReq("x=1", "application/x-www-form-urlencoded");
    const result = await readJsonBody(req);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(415);
      expect(result.reason).toMatch(/application\/json/);
    }
  });

  it("accepts application/json with charset suffix", async () => {
    const req = makeReq(`{"a":1}`, "application/json; charset=utf-8");
    const result = await readJsonBody(req);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual({ a: 1 });
  });

  it("rejects bodies over 256 KB with 413", async () => {
    const tooBig = Buffer.alloc(MAX_JSON_BODY_BYTES + 1, 0x20);
    const req = makeReq(tooBig);
    const result = await readJsonBody(req);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(413);
    }
  });
});
