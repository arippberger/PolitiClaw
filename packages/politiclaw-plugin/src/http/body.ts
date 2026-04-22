/**
 * JSON body parser for the dashboard's POST endpoints.
 *
 * Bounded buffer (256 KB) so a malformed or hostile request can't consume
 * unbounded memory. Returns a discriminated result instead of throwing so
 * route handlers can map each failure mode to the right HTTP response.
 */
import type { IncomingMessage } from "node:http";

export const MAX_JSON_BODY_BYTES = 256 * 1024;

export type JsonBodyResult =
  | { ok: true; value: unknown }
  | { ok: false; status: 400 | 413 | 415; reason: string };

export async function readJsonBody(req: IncomingMessage): Promise<JsonBodyResult> {
  const contentType = (req.headers["content-type"] ?? "").toString().toLowerCase();
  if (contentType && !contentType.includes("application/json")) {
    return { ok: false, status: 415, reason: "expected application/json" };
  }

  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk)
      ? chunk
      : Buffer.from(chunk as string | Uint8Array);
    total += buf.length;
    if (total > MAX_JSON_BODY_BYTES) {
      return { ok: false, status: 413, reason: "request body exceeds 256 KB" };
    }
    chunks.push(buf);
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (raw === "") return { ok: true, value: {} };
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, status: 400, reason: `invalid JSON body: ${message}` };
  }
}
