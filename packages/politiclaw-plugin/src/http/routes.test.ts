import type { IncomingMessage, ServerResponse } from "node:http";

import { describe, expect, it } from "vitest";

import { openMemoryDb } from "../storage/sqlite.js";

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
  return { method, url } as unknown as IncomingMessage;
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
    expect(parsed.schemaVersion).toBe(2);
    expect(parsed.preferences.status).toBe("missing");
    expect(captured).not.toBeNull();
    expect(captured?.schemaVersion).toBe(2);
  });

  it("returns 405 with Allow header for non-GET methods", async () => {
    const db = openMemoryDb();
    const res = makeRes();
    const handled = await handleDashboardRequest(
      makeReq("POST", "/politiclaw/api/status"),
      res,
      { deps: { db } },
    );
    expect(handled).toBe(true);
    const state = resState(res);
    expect(state.statusCode).toBe(405);
    expect(String(state.headers["Allow"])).toContain("GET");
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
