/**
 * Dashboard HTTP route registrar.
 *
 * Registers a single prefix-matched route at `/politiclaw` and demuxes
 * requests inside the handler. URLs served:
 *
 *   GET  /politiclaw                  → index.html (trailing slash redirect)
 *   GET  /politiclaw/                 → index.html
 *   GET  /politiclaw/app.js           → static JS bundle
 *   GET  /politiclaw/style.css        → static CSS
 *   GET  /politiclaw/api/status       → JSON payload (also issues CSRF cookie)
 *   POST /politiclaw/api/preferences  → upsert address / cadence / stances
 *   POST /politiclaw/api/monitoring   → bulk pause/resume PolitiClaw cron jobs
 *   POST /politiclaw/api/stance-signals       → record a single quick-vote
 *   POST /politiclaw/api/letters/:id/redraft  → flag a past letter for re-draft
 *
 * Posture:
 *   - `auth: "plugin"` because this is local-only. The gateway adds no auth
 *     layer for plugin-owned routes; the plugin is responsible for any
 *     additional checks. We deliberately add none: the dashboard is designed
 *     for localhost access, and a user who exposes the gateway to other hosts
 *     should be warned separately.
 *   - GET / HEAD are unauthenticated; both also issue a `pc_csrf` cookie.
 *   - POST requires a valid `X-PolitiClaw-CSRF` header that mirrors the
 *     `pc_csrf` cookie (double-submit CSRF). Mismatch → 403.
 *   - Body parsing is bounded (256 KB) and JSON-only.
 */
import type { IncomingMessage, ServerResponse } from "node:http";

import {
  buildStatusPayload,
  type BuildStatusDeps,
  type StatusPayload,
} from "./status.js";
import { loadDashboardAsset } from "./assets.js";
import { ensureCsrfCookie, verifyCsrf } from "./csrf.js";
import { readJsonBody } from "./body.js";
import {
  handleLetterRedraft,
  handleMonitoringToggle,
  handlePreferencesUpdate,
  handleStanceSignalCreate,
  type MutationResult,
} from "./mutations.js";

export const DASHBOARD_ROUTE_PREFIX = "/politiclaw";

export type DashboardRouteDeps = BuildStatusDeps;

export type DashboardRouteOptions = {
  deps: DashboardRouteDeps;
  /** Hook for tests to capture the computed payload without re-reading the response body. */
  onStatusPayload?: (payload: StatusPayload) => void;
};

export type DashboardRouteRegistrar = {
  path: string;
  match: "prefix";
  auth: "plugin";
  handler: (
    req: IncomingMessage,
    res: ServerResponse,
  ) => Promise<boolean | void> | boolean | void;
};

export function createDashboardRoute(
  options: DashboardRouteOptions,
): DashboardRouteRegistrar {
  return {
    path: DASHBOARD_ROUTE_PREFIX,
    match: "prefix",
    auth: "plugin",
    handler: (req, res) => handleDashboardRequest(req, res, options),
  };
}

const LETTER_REDRAFT_PATTERN = /^\/api\/letters\/(\d+)\/redraft$/;

export async function handleDashboardRequest(
  req: IncomingMessage,
  res: ServerResponse,
  options: DashboardRouteOptions,
): Promise<boolean> {
  const method = (req.method ?? "GET").toUpperCase();
  const url = new URL(req.url ?? "/", "http://localhost");
  const pathname = url.pathname;

  if (!pathname.startsWith(DASHBOARD_ROUTE_PREFIX)) return false;

  const remainder = pathname.slice(DASHBOARD_ROUTE_PREFIX.length);

  if (method === "GET" || method === "HEAD") {
    if (remainder === "" || remainder === "/") {
      ensureCsrfCookie(req, res);
      return serveAsset(res, "index.html", method);
    }
    if (remainder === "/api/status") {
      ensureCsrfCookie(req, res);
      return serveStatus(res, method, options);
    }
    if (remainder === "/app.js") return serveAsset(res, "app.js", method);
    if (remainder === "/style.css") return serveAsset(res, "style.css", method);
    sendText(res, 404, "Not Found");
    return true;
  }

  if (method === "POST") {
    return handlePost(req, res, remainder, options);
  }

  sendText(res, 405, "Method Not Allowed", { Allow: "GET, HEAD, POST" });
  return true;
}

async function handlePost(
  req: IncomingMessage,
  res: ServerResponse,
  remainder: string,
  options: DashboardRouteOptions,
): Promise<boolean> {
  const csrfCheck = verifyCsrf(req);
  if (!csrfCheck.ok) {
    sendJson(res, 403, {
      error: "csrf_failed",
      message: csrfCheck.reason,
    });
    return true;
  }

  if (remainder === "/api/preferences") {
    const body = await readJsonBody(req);
    if (!body.ok) {
      sendJson(res, body.status, { error: "invalid_body", message: body.reason });
      return true;
    }
    const result = handlePreferencesUpdate(options.deps.db, body.value);
    sendMutation(res, result);
    return true;
  }

  if (remainder === "/api/monitoring") {
    const body = await readJsonBody(req);
    if (!body.ok) {
      sendJson(res, body.status, { error: "invalid_body", message: body.reason });
      return true;
    }
    const result = await handleMonitoringToggle(body.value);
    sendMutation(res, result);
    return true;
  }

  if (remainder === "/api/stance-signals") {
    const body = await readJsonBody(req);
    if (!body.ok) {
      sendJson(res, body.status, { error: "invalid_body", message: body.reason });
      return true;
    }
    const result = handleStanceSignalCreate(options.deps.db, body.value);
    sendMutation(res, result);
    return true;
  }

  const redraftMatch = LETTER_REDRAFT_PATTERN.exec(remainder);
  if (redraftMatch) {
    const letterId = Number.parseInt(redraftMatch[1]!, 10);
    const result = handleLetterRedraft(options.deps.db, letterId);
    sendMutation(res, result);
    return true;
  }

  sendText(res, 404, "Not Found");
  return true;
}

function serveAsset(
  res: ServerResponse,
  name: string,
  method: string,
): boolean {
  const asset = loadDashboardAsset(name);
  if (!asset) {
    sendText(res, 404, "Not Found");
    return true;
  }
  res.statusCode = 200;
  res.setHeader("Content-Type", asset.contentType);
  res.setHeader("Content-Length", asset.body.byteLength);
  res.setHeader("Cache-Control", "no-store");
  if (method === "HEAD") {
    res.end();
  } else {
    res.end(asset.body);
  }
  return true;
}

async function serveStatus(
  res: ServerResponse,
  method: string,
  options: DashboardRouteOptions,
): Promise<boolean> {
  try {
    const payload = await buildStatusPayload(options.deps);
    options.onStatusPayload?.(payload);
    const body = Buffer.from(JSON.stringify(payload), "utf8");
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Length", body.byteLength);
    res.setHeader("Cache-Control", "no-store");
    if (method === "HEAD") res.end();
    else res.end(body);
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const body = Buffer.from(
      JSON.stringify({ error: "status_build_failed", message }),
      "utf8",
    );
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Length", body.byteLength);
    res.end(body);
    return true;
  }
}

function sendMutation(res: ServerResponse, result: MutationResult): void {
  sendJson(res, result.status, result.body);
}

function sendJson(
  res: ServerResponse,
  statusCode: number,
  body: unknown,
): void {
  const buf = Buffer.from(JSON.stringify(body), "utf8");
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Length", buf.byteLength);
  res.setHeader("Cache-Control", "no-store");
  res.end(buf);
}

function sendText(
  res: ServerResponse,
  statusCode: number,
  message: string,
  extraHeaders: Record<string, string> = {},
): void {
  const body = Buffer.from(message, "utf8");
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Content-Length", body.byteLength);
  for (const [name, value] of Object.entries(extraHeaders)) {
    res.setHeader(name, value);
  }
  res.end(body);
}
