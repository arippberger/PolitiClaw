/**
 * Double-submit-cookie CSRF for the dashboard's POST endpoints.
 *
 * The dashboard is "local-only" by design: `auth: "plugin"` means the gateway
 * does not authenticate requests, and we expect the user to reach
 * `http://localhost:<port>/politiclaw/` from their own browser. CSRF still
 * matters in that posture: a malicious page the user visits in another tab
 * can issue cross-origin POSTs to localhost. We mitigate with double-submit:
 *
 *   1. On every dashboard GET, ensure a `pc_csrf` cookie exists. The token is
 *      a 32-byte random hex string; SameSite=Strict prevents the browser from
 *      attaching it on cross-site requests.
 *   2. The dashboard JS reads the cookie and mirrors it in the
 *      `X-PolitiClaw-CSRF` request header on every POST.
 *   3. The server compares cookie ←→ header with `crypto.timingSafeEqual` and
 *      rejects mismatches with 403.
 *
 * Cross-origin attacker can't read the cookie (SameSite-Strict + same-origin
 * policy), so they can't forge the header value. Same-origin attacker can,
 * but at that point CSRF is the wrong threat to think about.
 *
 * We do NOT rotate the cookie per request — rotation would race the client's
 * concurrent fetches. The token is stable for the lifetime of the cookie.
 */
import { randomBytes, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

export const CSRF_COOKIE_NAME = "pc_csrf";
export const CSRF_HEADER_NAME = "x-politiclaw-csrf";
const TOKEN_BYTES = 32;
const COOKIE_PATH = "/politiclaw";

export function generateCsrfToken(): string {
  return randomBytes(TOKEN_BYTES).toString("hex");
}

export function parseCookies(req: IncomingMessage): Record<string, string> {
  const header = req.headers["cookie"];
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

/**
 * Ensure the response carries a CSRF cookie. If the request already has a
 * `pc_csrf` cookie, returns it unchanged so concurrent tabs don't churn the
 * token. Otherwise generates a new one and emits a `Set-Cookie` header.
 */
export function ensureCsrfCookie(
  req: IncomingMessage,
  res: ServerResponse,
): string {
  const existing = parseCookies(req)[CSRF_COOKIE_NAME];
  if (existing && /^[0-9a-f]{64}$/i.test(existing)) return existing;
  const token = generateCsrfToken();
  res.setHeader(
    "Set-Cookie",
    `${CSRF_COOKIE_NAME}=${token}; Path=${COOKIE_PATH}; SameSite=Strict`,
  );
  return token;
}

export type CsrfCheckResult =
  | { ok: true }
  | { ok: false; reason: string };

export function verifyCsrf(req: IncomingMessage): CsrfCheckResult {
  const cookie = parseCookies(req)[CSRF_COOKIE_NAME];
  if (!cookie) return { ok: false, reason: "missing csrf cookie" };
  const headerRaw = req.headers[CSRF_HEADER_NAME];
  const header = Array.isArray(headerRaw) ? headerRaw[0] : headerRaw;
  if (!header) return { ok: false, reason: "missing csrf header" };
  const a = Buffer.from(cookie, "utf8");
  const b = Buffer.from(header, "utf8");
  if (a.length !== b.length) return { ok: false, reason: "csrf token length mismatch" };
  if (!timingSafeEqual(a, b)) return { ok: false, reason: "csrf token mismatch" };
  return { ok: true };
}
