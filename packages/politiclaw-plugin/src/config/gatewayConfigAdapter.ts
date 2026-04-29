/**
 * Thin wrapper around the OpenClaw gateway's config-mutation methods.
 *
 * The api-keys writer (called from politiclaw_configure when apiDataGov / optionalApiKeys
 * are passed inline) writes to `plugins.entries.politiclaw.config.apiKeys.*` by
 * calling `config.patch` (with a `baseHash` from `config.get` for optimistic
 * concurrency). The wrapper exists so tests can inject a fake without
 * opening a real gateway websocket — production goes through callGatewayTool.
 *
 * Test override: call `setGatewayConfigAdapterForTests(adapter)`. Reset with
 * `resetGatewayConfigAdapterForTests()`.
 */

import { callGatewayTool } from "openclaw/plugin-sdk/agent-harness";

export type ConfigSnapshot = {
  /** Stable content hash used as the baseHash for optimistic-concurrency writes. */
  hash: string;
  /** Path to the live config file on disk (informational). */
  path?: string;
  /**
   * The merged, validated config — secrets redacted by the gateway. Suitable
   * for "is this key currently set?" checks; do not echo secrets back from it.
   */
  config: Record<string, unknown>;
};

export type ConfigPatchInput = {
  /** JSON-merge-patch object. The adapter stringifies it for the gateway. */
  patch: Record<string, unknown>;
  /** From `getSnapshot().hash` — required by the gateway for write safety. */
  baseHash: string;
  /** Optional human-readable note attached to the restart sentinel. */
  note?: string;
  /** Optional delay before the gateway restarts (ms). */
  restartDelayMs?: number;
};

export type ConfigRestartInfo = {
  /** Delay the gateway will wait before restarting, in ms. */
  delayMs?: number;
  /** True when the gateway folded this restart into an already-pending one. */
  coalesced?: boolean;
};

export type ConfigPatchResult = {
  /** True when the merged config matched the existing one — no write happened. */
  noop: boolean;
  /** Path to the config file that was (or would have been) written. */
  path?: string;
  /** Restart bookkeeping — undefined when no restart is needed for the changed paths. */
  restart?: ConfigRestartInfo;
  /** Redacted post-merge config (secrets masked). */
  config: Record<string, unknown>;
};

export type GatewayConfigAdapter = {
  getSnapshot(): Promise<ConfigSnapshot>;
  patch(input: ConfigPatchInput): Promise<ConfigPatchResult>;
};

type RawConfigGetResponse = {
  hash?: unknown;
  path?: unknown;
  config?: unknown;
};

type RawConfigPatchResponse = {
  ok?: unknown;
  noop?: unknown;
  path?: unknown;
  config?: unknown;
  restart?: { delayMs?: unknown; coalesced?: unknown } | null | undefined;
};

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

const realGatewayConfigAdapter: GatewayConfigAdapter = {
  async getSnapshot() {
    const response = await callGatewayTool<RawConfigGetResponse>(
      "config.get",
      {},
      {},
    );
    const hash = asString(response?.hash);
    if (!hash) {
      throw new Error(
        "config.get returned no baseHash; cannot safely patch the config",
      );
    }
    return {
      hash,
      path: asString(response?.path),
      config: asRecord(response?.config),
    };
  },
  async patch(input) {
    const response = await callGatewayTool<RawConfigPatchResponse>(
      "config.patch",
      {},
      {
        raw: JSON.stringify(input.patch),
        baseHash: input.baseHash,
        ...(input.note ? { note: input.note } : {}),
        ...(typeof input.restartDelayMs === "number"
          ? { restartDelayMs: input.restartDelayMs }
          : {}),
      },
    );
    const restart = response?.restart;
    return {
      noop: response?.noop === true,
      path: asString(response?.path),
      config: asRecord(response?.config),
      restart:
        restart && typeof restart === "object"
          ? {
              delayMs:
                typeof restart.delayMs === "number" ? restart.delayMs : undefined,
              coalesced: restart.coalesced === true ? true : undefined,
            }
          : undefined,
    };
  },
};

let activeAdapter: GatewayConfigAdapter = realGatewayConfigAdapter;

export function getGatewayConfigAdapter(): GatewayConfigAdapter {
  return activeAdapter;
}

export function setGatewayConfigAdapterForTests(
  adapter: GatewayConfigAdapter | null,
): void {
  activeAdapter = adapter ?? realGatewayConfigAdapter;
}

export function resetGatewayConfigAdapterForTests(): void {
  activeAdapter = realGatewayConfigAdapter;
}
