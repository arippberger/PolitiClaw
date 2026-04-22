import type { IncomingMessage, ServerResponse } from "node:http";

import { describe, expect, it } from "vitest";

import { openMemoryDb } from "../storage/sqlite.js";
import { Readable } from "node:stream";

import { CSRF_COOKIE_NAME } from "./csrf.js";
import {
  DASHBOARD_ROUTE_PREFIX,
  createDashboardRoute,
  handleDashboardRequest,
} from "./routes.js";
import type { StatusPayload } from "./status.js";

type RecordedResponse = {
  statusCode: number;
  headers: Record<string, string | number>;
  body: Buffer;
  ended: boolean;
};

function makeRes(): RecordedResponse & ServerResponse {
  const state: RecordedResponse = {
    statusCode: 0,
    headers: {},
    body: Buffer.alloc(0),
    ended: false,
  };
  const res = {
    get statusCode() {
      return state.statusCode;
    },
    set statusCode(value: number) {
      state.statusCode = value;
    },
    setHeader(name: string, value: string | number) {
      state.headers[name] = value;
    },
    getHeader(name: string) {
      return state.headers[name];
    },
    end(payload?: string | Buffer) {
      if (payload !== undefined) {
        state.body = Buffer.isBuffer(payload)
          ? payload
          : Buffer.from(String(payload));
      }
      state.ended = true;
    },
    __state: state,
  };
  const proxy = new Proxy(res, {
    get(target, prop) {
      if (prop === "statusCode") return state.statusCode;
      if (prop === "headers") return state.headers;
      if (prop === "body") return state.body;
      if (prop === "ended") return state.ended;
      return (target as Record<string | symbol, unknown>)[prop];
    },
    set(target, prop, value) {
      if (prop === "statusCode") {
        state.statusCode = value as number;
        return true;
      }
      (target as Record<string | symbol, unknown>)[prop] = value;
      return true;
    },
  });
  return proxy as unknown as RecordedResponse & ServerResponse;
}

function makeReq(method: string, url: string): IncomingMessage {
  return { method, url, headers: {} } as unknown as IncomingMessage;
}

function makePostReq(
  url: string,
  body: string,
  init: {
    cookie?: string;
    csrfHeader?: string;
    contentType?: string;
  } = {},
): IncomingMessage {
  const buf = Buffer.from(body, "utf8");
  const readable = Readable.from([buf]);
  const req = readable as unknown as IncomingMessage & {
    method: string;
    url: string;
    headers: Record<string, string>;
  };
  req.method = "POST";
  req.url = url;
  const headers: Record<string, string> = {
    "content-type": init.contentType ?? "application/json",
  };
  if (init.cookie !== undefined) headers["cookie"] = init.cookie;
  if (init.csrfHeader !== undefined)
    headers["x-politiclaw-csrf"] = init.csrfHeader;
  req.headers = headers;
  return req as IncomingMessage;
}

function bodyText(res: RecordedResponse & ServerResponse): string {
  return (res as unknown as { body: Buffer }).body.toString("utf8");
}

function resState(res: RecordedResponse & ServerResponse): RecordedResponse {
  return res as unknown as RecordedResponse;
}

describe("createDashboardRoute", () => {
  it("returns a registrar with path, prefix match, and plugin auth", () => {
    const route = createDashboardRoute({
      deps: { db: openMemoryDb() },
    });
    expect(route.path).toBe(DASHBOARD_ROUTE_PREFIX);
    expect(route.match).toBe("prefix");
    expect(route.auth).toBe("plugin");
    expect(typeof route.handler).toBe("function");
  });
});

describe("handleDashboardRequest", () => {
  it("serves index.html at /politiclaw", async () => {
    const db = openMemoryDb();
    const res = makeRes();
    const handled = await handleDashboardRequest(
      makeReq("GET", "/politiclaw"),
      res,
      { deps: { db } },
    );
    expect(handled).toBe(true);
    const state = resState(res);
    expect(state.statusCode).toBe(200);
    expect(state.headers["Content-Type"]).toMatch(/text\/html/);
    expect(bodyText(res)).toContain("<title>PolitiClaw Status</title>");
  });

  it("serves index.html at /politiclaw/ (trailing slash)", async () => {
    const db = openMemoryDb();
    const res = makeRes();
    await handleDashboardRequest(makeReq("GET", "/politiclaw/"), res, {
      deps: { db },
    });
    expect(resState(res).statusCode).toBe(200);
    expect(bodyText(res)).toContain("PolitiClaw Status");
  });

  it("serves app.js with a JS content-type", async () => {
    const db = openMemoryDb();
    const res = makeRes();
    await handleDashboardRequest(makeReq("GET", "/politiclaw/app.js"), res, {
      deps: { db },
    });
    const state = resState(res);
    expect(state.statusCode).toBe(200);
    expect(String(state.headers["Content-Type"])).toMatch(/javascript/);
    expect(bodyText(res)).toContain("api/status");
  });

  it("serves style.css with a CSS content-type", async () => {
    const db = openMemoryDb();
    const res = makeRes();
    await handleDashboardRequest(makeReq("GET", "/politiclaw/style.css"), res, {
      deps: { db },
    });
    const state = resState(res);
    expect(state.statusCode).toBe(200);
    expect(String(state.headers["Content-Type"])).toMatch(/text\/css/);
    expect(bodyText(res)).toContain(".pc-section");
  });

  it("serves a parseable status payload at /politiclaw/api/status", async () => {
    const db = openMemoryDb();
    const res = makeRes();
    let captured: StatusPayload | null = null;
    await handleDashboardRequest(
      makeReq("GET", "/politiclaw/api/status"),
      res,
      {
        deps: { db },
        onStatusPayload: (payload) => {
          captured = payload;
        },
      },
    );
    const state = resState(res);
    expect(state.statusCode).toBe(200);
    expect(String(state.headers["Content-Type"])).toMatch(/application\/json/);
    const parsed = JSON.parse(bodyText(res)) as StatusPayload;
    expect(parsed.schemaVersion).toBe(3);
    expect(parsed.preferences.status).toBe("missing");
    expect(captured).not.toBeNull();
    expect(captured?.schemaVersion).toBe(3);
  });

  it("returns 405 with Allow header for unsupported methods like PUT", async () => {
    const db = openMemoryDb();
    const res = makeRes();
    const handled = await handleDashboardRequest(
      makeReq("PUT", "/politiclaw/api/status"),
      res,
      { deps: { db } },
    );
    expect(handled).toBe(true);
    const state = resState(res);
    expect(state.statusCode).toBe(405);
    expect(String(state.headers["Allow"])).toContain("GET");
    expect(String(state.headers["Allow"])).toContain("POST");
  });

  it("rejects POST without a matching CSRF cookie+header as 403", async () => {
    const db = openMemoryDb();
    const res = makeRes();
    const handled = await handleDashboardRequest(
      makePostReq("/politiclaw/api/preferences", "{}"),
      res,
      { deps: { db } },
    );
    expect(handled).toBe(true);
    const state = resState(res);
    expect(state.statusCode).toBe(403);
    const parsed = JSON.parse(bodyText(res)) as { error: string };
    expect(parsed.error).toBe("csrf_failed");
  });

  it("accepts POST /api/preferences with matching CSRF cookie+header", async () => {
    const db = openMemoryDb();
    const res = makeRes();
    const token =
      "abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234";
    const body = JSON.stringify({
      address: "742 Evergreen Terrace",
      state: "CA",
    });
    const handled = await handleDashboardRequest(
      makePostReq("/politiclaw/api/preferences", body, {
        cookie: `${CSRF_COOKIE_NAME}=${token}`,
        csrfHeader: token,
      }),
      res,
      { deps: { db } },
    );
    expect(handled).toBe(true);
    const state = resState(res);
    expect(state.statusCode).toBe(200);
    const parsed = JSON.parse(bodyText(res)) as {
      preferences: { address: string };
    };
    expect(parsed.preferences.address).toBe("742 Evergreen Terrace");
  });

  it("routes POST /api/letters/:id/redraft to the redraft handler", async () => {
    const db = openMemoryDb();
    db.prepare(
      `INSERT INTO letters (rep_id, rep_name, rep_office, issue, bill_id, subject, body,
                            citations_json, stance_snapshot_hash, word_count, created_at)
       VALUES ('B000001', 'Rep One', 'US House', 'housing', NULL, 'Subj', 'body',
               '[]', 'hash', 10, ?)`,
    ).run(Date.now());
    const token =
      "abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234";
    const res = makeRes();
    await handleDashboardRequest(
      makePostReq("/politiclaw/api/letters/1/redraft", "", {
        cookie: `${CSRF_COOKIE_NAME}=${token}`,
        csrfHeader: token,
      }),
      res,
      { deps: { db } },
    );
    const state = resState(res);
    expect(state.statusCode).toBe(200);
    const parsed = JSON.parse(bodyText(res)) as { status: string };
    expect(parsed.status).toBe("ok");
  });

  it("responds to HEAD on the index with empty body but correct headers", async () => {
    const db = openMemoryDb();
    const res = makeRes();
    await handleDashboardRequest(makeReq("HEAD", "/politiclaw/"), res, {
      deps: { db },
    });
    const state = resState(res);
    expect(state.statusCode).toBe(200);
    expect(String(state.headers["Content-Type"])).toMatch(/text\/html/);
    expect(state.body.byteLength).toBe(0);
  });

  it("returns 404 for unknown sub-paths under the prefix", async () => {
    const db = openMemoryDb();
    const res = makeRes();
    const handled = await handleDashboardRequest(
      makeReq("GET", "/politiclaw/bogus"),
      res,
      { deps: { db } },
    );
    expect(handled).toBe(true);
    expect(resState(res).statusCode).toBe(404);
  });

  it("returns false for paths outside the prefix", async () => {
    const db = openMemoryDb();
    const res = makeRes();
    const handled = await handleDashboardRequest(
      makeReq("GET", "/somewhere-else"),
      res,
      { deps: { db } },
    );
    expect(handled).toBe(false);
    expect(resState(res).ended).toBe(false);
  });

  it("returns a 500 JSON error body when the status builder throws", async () => {
    const brokenDb = {
      prepare() {
        throw new Error("db offline");
      },
    } as unknown as ReturnType<typeof openMemoryDb>;
    const res = makeRes();
    const handled = await handleDashboardRequest(
      makeReq("GET", "/politiclaw/api/status"),
      res,
      { deps: { db: brokenDb } },
    );
    expect(handled).toBe(true);
    const state = resState(res);
    expect(state.statusCode).toBe(500);
    expect(String(state.headers["Content-Type"])).toMatch(/application\/json/);
    const parsed = JSON.parse(bodyText(res)) as { error: string; message: string };
    expect(parsed.error).toBe("status_build_failed");
    expect(parsed.message).toContain("db offline");
  });
});
