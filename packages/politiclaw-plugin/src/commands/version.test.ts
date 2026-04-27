import type { PluginCommandContext } from "openclaw/plugin-sdk/plugin-entry";
import { describe, expect, it } from "vitest";

import packageJson from "../../package.json" with { type: "json" };
import { versionCommand } from "./version.js";

const fakeCtx = {} as unknown as PluginCommandContext;

function textOf(result: unknown): string {
  return (result as { text: string }).text;
}

describe("politiclaw-version command", () => {
  it("reads the live plugin version from package.json", async () => {
    const text = textOf(await versionCommand.handler(fakeCtx));
    expect(text).toContain(`PolitiClaw ${packageJson.version}`);
  });

  it("includes the OpenClaw runtime floor and plugin API floor", async () => {
    const text = textOf(await versionCommand.handler(fakeCtx));
    expect(text).toContain("Plugin API floor:");
    expect(text).toContain("Minimum OpenClaw host:");
  });
});
