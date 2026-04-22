import type { IncomingMessage, ServerResponse } from "node:http";

import { describe, expect, it } from "vitest";

import {
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  ensureCsrfCookie,
  generateCsrfToken,
  parseCookies,
  verifyCsrf,
} from "./csrf.js";

function makeReq(init: {
  cookie?: string;
  headers?: Record<string, string | string[] | undefined>;
}): IncomingMessage {
  const headers: Record<string, string | string[] | undefined> = {
    ...(init.headers ?? {}),
  };
  if (init.cookie !== undefined) headers["cookie"] = init.cookie;
  return { headers } as unknown as IncomingMessage;
}

type RecordedRes = {
  headers: Record<string, string | number | string[]>;
};

function makeRes(): RecordedRes & ServerResponse {
  const state: RecordedRes = { headers: {} };
  const res = {
    setHeader(name: string, value: string | number | string[]) {
      state.headers[name] = value;
    },
    getHeader(name: string) {
      return state.headers[name];
    },
    __state: state,
  };
  return new Proxy(res, {
    get(target, prop) {
      if (prop === "headers") return state.headers;
      return (target as Record<string | symbol, unknown>)[prop];
    },
  }) as unknown as RecordedRes & ServerResponse;
}

describe("generateCsrfToken", () => {
  it("returns 64 lowercase hex chars and is random", () => {
    const a = generateCsrfToken();
    const b = generateCsrfToken();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(b).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });
});

describe("parseCookies", () => {
  it("parses multiple cookies with decoding", () => {
    const req = makeReq({ cookie: "pc_csrf=abc; other=hello%20world" });
    const cookies = parseCookies(req);
    expect(cookies.pc_csrf).toBe("abc");
    expect(cookies.other).toBe("hello world");
  });

  it("returns {} when no cookie header is present", () => {
    expect(parseCookies(makeReq({}))).toEqual({});
  });

  it("ignores malformed fragments without throwing", () => {
    const req = makeReq({ cookie: "; =empty; keyonly;   ; good=1" });
    const cookies = parseCookies(req);
    expect(cookies.good).toBe("1");
    expect(Object.keys(cookies)).toContain("good");
  });
});

describe("ensureCsrfCookie", () => {
  it("returns the existing cookie value and does NOT set a new one", () => {
    const token = generateCsrfToken();
    const req = makeReq({ cookie: `${CSRF_COOKIE_NAME}=${token}` });
    const res = makeRes();
    const got = ensureCsrfCookie(req, res);
    expect(got).toBe(token);
    expect(res.getHeader("Set-Cookie")).toBeUndefined();
  });

  it("issues a fresh cookie when none is present", () => {
    const req = makeReq({});
    const res = makeRes();
    const token = ensureCsrfCookie(req, res);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    const setCookie = String(res.getHeader("Set-Cookie"));
    expect(setCookie).toContain(`${CSRF_COOKIE_NAME}=${token}`);
    expect(setCookie).toContain("SameSite=Strict");
    expect(setCookie).toContain("Path=/politiclaw");
  });

  it("rotates an invalid-shaped cookie value", () => {
    const req = makeReq({ cookie: `${CSRF_COOKIE_NAME}=not-hex` });
    const res = makeRes();
    const token = ensureCsrfCookie(req, res);
    expect(token).not.toBe("not-hex");
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(String(res.getHeader("Set-Cookie"))).toContain(token);
  });
});

describe("verifyCsrf", () => {
  it("accepts matching cookie + header with timing-safe compare", () => {
    const token = generateCsrfToken();
    const req = makeReq({
      cookie: `${CSRF_COOKIE_NAME}=${token}`,
      headers: { [CSRF_HEADER_NAME]: token },
    });
    expect(verifyCsrf(req)).toEqual({ ok: true });
  });

  it("rejects a request with no cookie", () => {
    const req = makeReq({ headers: { [CSRF_HEADER_NAME]: "abc" } });
    const result = verifyCsrf(req);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/missing csrf cookie/);
  });

  it("rejects a request with cookie but no header", () => {
    const token = generateCsrfToken();
    const req = makeReq({ cookie: `${CSRF_COOKIE_NAME}=${token}` });
    const result = verifyCsrf(req);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/missing csrf header/);
  });

  it("rejects cookie ≠ header", () => {
    const a = generateCsrfToken();
    const b = generateCsrfToken();
    const req = makeReq({
      cookie: `${CSRF_COOKIE_NAME}=${a}`,
      headers: { [CSRF_HEADER_NAME]: b },
    });
    const result = verifyCsrf(req);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/mismatch/);
  });

  it("rejects length mismatch without invoking timingSafeEqual", () => {
    const token = generateCsrfToken();
    const req = makeReq({
      cookie: `${CSRF_COOKIE_NAME}=${token}`,
      headers: { [CSRF_HEADER_NAME]: token.slice(0, 30) },
    });
    const result = verifyCsrf(req);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/length mismatch/);
  });
});
