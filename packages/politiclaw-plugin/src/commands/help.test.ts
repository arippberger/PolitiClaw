import type { PluginCommandContext } from "openclaw/plugin-sdk/plugin-entry";
import { describe, expect, it } from "vitest";

import { helpCommand } from "./help.js";

const fakeCtx = {} as unknown as PluginCommandContext;

function textOf(result: unknown): string {
  return (result as { text: string }).text;
}

describe("politiclaw-help command", () => {
  it("lists at least one tier-1 tool by name", async () => {
    const text = textOf(await helpCommand.handler(fakeCtx));
    expect(text).toContain("politiclaw_configure");
  });

  it("advertises the four other quick commands", async () => {
    const text = textOf(await helpCommand.handler(fakeCtx));
    expect(text).toContain("/politiclaw-status");
    expect(text).toContain("/politiclaw-doctor");
    expect(text).toContain("/politiclaw-keys");
    expect(text).toContain("/politiclaw-version");
  });
});
