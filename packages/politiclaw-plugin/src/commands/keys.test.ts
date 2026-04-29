import type { PluginCommandContext } from "openclaw/plugin-sdk/plugin-entry";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  resetStorageConfigForTests,
  setPluginConfigForTests,
} from "../storage/context.js";
import { keysCommand } from "./keys.js";

const fakeCtx = {} as unknown as PluginCommandContext;

function textOf(result: unknown): string {
  return (result as { text: string }).text;
}

afterEach(() => {
  resetStorageConfigForTests();
});

describe("politiclaw-keys command", () => {
  it("shows every supported key with required/optional and not-set state by default", async () => {
    setPluginConfigForTests({ apiKeys: {} });
    const text = textOf(await keysCommand.handler(fakeCtx));
    expect(text).toContain("api.data.gov (required, not set)");
    expect(text).toContain("Geocodio (optional, not set)");
    expect(text).toContain("Google Civic (optional, not set)");
  });

  it("flips state to set when a key is configured", async () => {
    setPluginConfigForTests({
      apiKeys: { apiDataGov: "k", googleCivic: "k" },
    });
    const text = textOf(await keysCommand.handler(fakeCtx));
    expect(text).toContain("api.data.gov (required, set)");
    expect(text).toContain("Google Civic (optional, set)");
    expect(text).toContain("Geocodio (optional, not set)");
  });

  it("points users at the canonical save path", async () => {
    setPluginConfigForTests({ apiKeys: {} });
    const text = textOf(await keysCommand.handler(fakeCtx));
    expect(text).toContain("politiclaw_configure");
  });
});

beforeEach(() => {
  // Each test seeds its own config to avoid leakage from prior describes.
  setPluginConfigForTests({ apiKeys: {} });
});
