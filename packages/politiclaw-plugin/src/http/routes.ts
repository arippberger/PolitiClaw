/**
 * Dashboard HTTP route registrar.
 *
 * Registers a single prefix-matched route at `/politiclaw` and demuxes
 * requests inside the handler. Four URLs are served:
 *   GET /politiclaw                  → index.html (trailing slash redirect)
 *   GET /politiclaw/                 → index.html
 *   GET /politiclaw/app.js           → static JS bundle
 *   GET /politiclaw/style.css        → static CSS
 *   GET /politiclaw/api/status       → JSON payload
 *
 * Posture:
 *   - `auth: "plugin"` because this is local-only. The gateway adds no auth
 *     layer for plugin-owned routes; the plugin is responsible for any
 *     additional checks. We deliberately add none: the dashboard is intended
 *     to be local-only, and if the gateway is reachable off-host the operator
 *     is responsible for fronting it with auth.
 *   - Only GET is handled. Any other method returns 405.
 *   - The dashboard is read-only, so no CSRF machinery is required.
 */
import type { IncomingMessage, ServerResponse } from "node:http";

import {
  buildStatusPayload,
  type BuildStatusDeps,
  type StatusPayload,
} from "./status.js";
import { loadDashboardAsset } from "./assets.js";

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

export async function handleDashboardRequest(
  req: IncomingMessage,
  res: ServerResponse,
  options: DashboardRouteOptions,
): Promise<boolean> {
  const method = (req.method ?? "GET").toUpperCase();
  const url = new URL(req.url ?? "/", "http://localhost");
  const pathname = url.pathname;

  if (!pathname.startsWith(DASHBOARD_ROUTE_PREFIX)) return false;

  if (method !== "GET" && method !== "HEAD") {
    sendText(res, 405, "Method Not Allowed", { Allow: "GET, HEAD" });
    return true;
  }

  const remainder = pathname.slice(DASHBOARD_ROUTE_PREFIX.length);

  if (remainder === "" || remainder === "/") {
    return serveAsset(res, "index.html", method);
  }

  if (remainder === "/api/status") {
    return serveStatus(res, method, options);
  }

  if (remainder === "/app.js") {
    return serveAsset(res, "app.js", method);
  }

  if (remainder === "/style.css") {
    return serveAsset(res, "style.css", method);
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
