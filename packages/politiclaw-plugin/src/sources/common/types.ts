/**
 * Source-tier tag used throughout the plugin.
 *   1 — primary government / authoritative API
 *   2 — civic infrastructure / reputable aggregator
 *   3 — journalism
 *   4 — advocacy
 *   5 — LLM search / blog / unclassified
 */
export type SourceTier = 1 | 2 | 3 | 4 | 5;

export type AdapterHealth =
  | { status: "ok" }
  | { status: "degraded"; reason: string }
  | { status: "unavailable"; reason: string };

/**
 * Common result shape for every source adapter: either a typed payload with
 * its source-tier tag, or an explicit "unavailable" record. Domain code never
 * receives `null`; it always gets enough metadata to render the right message.
 */
export type AdapterResult<T> =
  | { status: "ok"; adapterId: string; tier: SourceTier; data: T; fetchedAt: number }
  | { status: "unavailable"; adapterId: string; reason: string; actionable?: string };

/**
 * Shared source-adapter interface. Narrow on purpose — the per-adapter schema
 * of `TResult` is pinned by the adapter itself.
 */
export interface SourceAdapter<TQuery, TResult> {
  id: string;
  tier: SourceTier;
  health(): Promise<AdapterHealth>;
  fetch(q: TQuery): Promise<AdapterResult<TResult>>;
}

export function unavailable<T>(
  adapterId: string,
  reason: string,
  actionable?: string,
): AdapterResult<T> {
  return { status: "unavailable", adapterId, reason, actionable };
}
