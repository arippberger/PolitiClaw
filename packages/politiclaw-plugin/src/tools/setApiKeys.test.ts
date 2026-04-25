import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  resetGatewayConfigAdapterForTests,
  setGatewayConfigAdapterForTests,
  type ConfigPatchInput,
  type GatewayConfigAdapter,
} from "../config/gatewayConfigAdapter.js";
import { createSetApiKeysTool, type SetApiKeysResult } from "./setApiKeys.js";

type Recorded = {
  snapshotCalls: number;
  patchCalls: ConfigPatchInput[];
};

function makeAdapter(opts: {
  hash?: string;
  existingApiKeys?: Record<string, string>;
  patchResult?: Partial<Awaited<ReturnType<GatewayConfigAdapter["patch"]>>>;
  patchThrows?: Error;
}): { adapter: GatewayConfigAdapter; recorded: Recorded } {
  const recorded: Recorded = { snapshotCalls: 0, patchCalls: [] };
  const adapter: GatewayConfigAdapter = {
    async getSnapshot() {
      recorded.snapshotCalls += 1;
      return {
        hash: opts.hash ?? "hash-123",
        path: "/test/openclaw.json",
        config: {
          plugins: {
            politiclaw: {
              apiKeys: opts.existingApiKeys ?? {},
            },
          },
        },
      };
    },
    async patch(input) {
      recorded.patchCalls.push(input);
      if (opts.patchThrows) throw opts.patchThrows;
      return {
        noop: false,
        path: "/test/openclaw.json",
        config: {},
        restart: { delayMs: 1500 },
        ...(opts.patchResult ?? {}),
      };
    },
  };
  return { adapter, recorded };
}

function detailsFrom<T>(result: { details?: T }): T {
  if (!result.details) throw new Error("expected details");
  return result.details;
}

function textFrom(result: {
  content?: Array<{ type: string; text?: string }>;
}): string {
  const block = result.content?.[0];
  if (!block || block.type !== "text" || !block.text) {
    throw new Error("expected text content");
  }
  return block.text;
}

describe("politiclaw_set_api_keys", () => {
  beforeEach(() => {
    resetGatewayConfigAdapterForTests();
  });
  afterEach(() => {
    resetGatewayConfigAdapterForTests();
  });

  it("writes a single key under plugins.politiclaw.apiKeys", async () => {
    const { adapter, recorded } = makeAdapter({});
    setGatewayConfigAdapterForTests(adapter);

    const tool = createSetApiKeysTool();
    const res = await tool.execute!(
      "call-1",
      { apiDataGov: "key-abc" },
      undefined,
      undefined,
    );
    const details = detailsFrom<SetApiKeysResult>(
      res as { details: SetApiKeysResult },
    );

    expect(recorded.snapshotCalls).toBe(1);
    expect(recorded.patchCalls).toHaveLength(1);
    expect(recorded.patchCalls[0].baseHash).toBe("hash-123");
    expect(recorded.patchCalls[0].patch).toEqual({
      plugins: {
        politiclaw: {
          apiKeys: { apiDataGov: "key-abc" },
        },
      },
    });
    expect(details.savedKeys).toEqual(["apiDataGov"]);
    expect(details.skippedKeys).toEqual([]);
    expect(details.restartScheduled).toBe(true);
  });

  it("merges multiple keys into a single patch (one restart)", async () => {
    const { adapter, recorded } = makeAdapter({});
    setGatewayConfigAdapterForTests(adapter);

    const tool = createSetApiKeysTool();
    await tool.execute!(
      "call-1",
      {
        apiDataGov: "data-gov",
        geocodio: "geo",
        openStates: "os",
      },
      undefined,
      undefined,
    );

    expect(recorded.patchCalls).toHaveLength(1);
    expect(recorded.patchCalls[0].patch).toEqual({
      plugins: {
        politiclaw: {
          apiKeys: {
            apiDataGov: "data-gov",
            geocodio: "geo",
            openStates: "os",
          },
        },
      },
    });
  });

  it("trims whitespace and skips empty strings", async () => {
    const { adapter, recorded } = makeAdapter({});
    setGatewayConfigAdapterForTests(adapter);

    const tool = createSetApiKeysTool();
    const res = await tool.execute!(
      "call-1",
      {
        apiDataGov: "  trimmed-key  ",
        geocodio: "   ",
        openStates: "",
      },
      undefined,
      undefined,
    );
    const details = detailsFrom<SetApiKeysResult>(
      res as { details: SetApiKeysResult },
    );

    expect(recorded.patchCalls[0].patch).toEqual({
      plugins: {
        politiclaw: {
          apiKeys: { apiDataGov: "trimmed-key" },
        },
      },
    });
    expect(details.savedKeys).toEqual(["apiDataGov"]);
    expect(details.skippedKeys).toEqual(["geocodio", "openStates"]);
  });

  it("returns nothing-to-do without calling the gateway when no keys are supplied", async () => {
    const { adapter, recorded } = makeAdapter({});
    setGatewayConfigAdapterForTests(adapter);

    const tool = createSetApiKeysTool();
    const res = await tool.execute!("call-1", {}, undefined, undefined);
    const details = detailsFrom<SetApiKeysResult>(
      res as { details: SetApiKeysResult },
    );

    expect(recorded.snapshotCalls).toBe(0);
    expect(recorded.patchCalls).toHaveLength(0);
    expect(details.savedKeys).toEqual([]);
    expect(details.noop).toBe(true);
    expect(details.restartScheduled).toBe(false);
  });

  it("propagates a noop from the gateway (key already set to the same value)", async () => {
    const { adapter } = makeAdapter({
      existingApiKeys: { apiDataGov: "key-abc" },
      patchResult: { noop: true, restart: undefined },
    });
    setGatewayConfigAdapterForTests(adapter);

    const tool = createSetApiKeysTool();
    const res = await tool.execute!(
      "call-1",
      { apiDataGov: "key-abc" },
      undefined,
      undefined,
    );
    const details = detailsFrom<SetApiKeysResult>(
      res as { details: SetApiKeysResult },
    );

    expect(details.noop).toBe(true);
    expect(details.restartScheduled).toBe(false);
    expect(details.savedKeys).toEqual(["apiDataGov"]);
  });

  it("surfaces the restart delay in the prompt text", async () => {
    const { adapter } = makeAdapter({
      patchResult: { restart: { delayMs: 2000 } },
    });
    setGatewayConfigAdapterForTests(adapter);

    const tool = createSetApiKeysTool();
    const res = await tool.execute!(
      "call-1",
      { apiDataGov: "key-abc" },
      undefined,
      undefined,
    );
    const text = textFrom(
      res as { content: Array<{ type: string; text: string }> },
    );

    expect(text).toContain("apiDataGov");
    expect(text).toContain("restart");
  });

  it("returns a structured failure when the gateway throws", async () => {
    const { adapter } = makeAdapter({
      patchThrows: new Error("baseHash mismatch"),
    });
    setGatewayConfigAdapterForTests(adapter);

    const tool = createSetApiKeysTool();
    const res = await tool.execute!(
      "call-1",
      { apiDataGov: "key-abc" },
      undefined,
      undefined,
    );
    const details = detailsFrom<SetApiKeysResult>(
      res as { details: SetApiKeysResult },
    );

    expect(details.status).toBe("error");
    if (details.status !== "error") throw new Error("type narrowing");
    expect(details.error).toContain("baseHash mismatch");
  });

  it("rejects unknown key names rather than silently writing them", async () => {
    const { adapter, recorded } = makeAdapter({});
    setGatewayConfigAdapterForTests(adapter);

    const tool = createSetApiKeysTool();
    const res = await tool.execute!(
      "call-1",
      { apiDataGov: "key", notARealKey: "x" } as Record<string, string>,
      undefined,
      undefined,
    );
    const details = detailsFrom<SetApiKeysResult>(
      res as { details: SetApiKeysResult },
    );

    // The tool reads only allowlisted names from input, so unknown fields
    // are dropped before they ever reach the gateway patch payload.
    expect(recorded.patchCalls).toHaveLength(1);
    expect(recorded.patchCalls[0].patch).toEqual({
      plugins: {
        politiclaw: { apiKeys: { apiDataGov: "key" } },
      },
    });
    expect(details.savedKeys).toEqual(["apiDataGov"]);
  });
});
