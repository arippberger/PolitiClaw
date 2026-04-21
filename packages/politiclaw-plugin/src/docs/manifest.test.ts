import { readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { POLITICLAW_CRON_TEMPLATES } from "../cron/templates.js";
import { DOCS_BASELINE } from "./sourceCoverage.js";
import { REGISTERED_POLITICLAW_TOOL_DOCS } from "./toolRegistry.js";

// Resolve the plugin root from this file's location so the test runs
// correctly regardless of the working directory vitest is invoked from.
const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("documentation baseline", () => {
  it("tracks the current registered tool count", () => {
    expect(REGISTERED_POLITICLAW_TOOL_DOCS).toHaveLength(DOCS_BASELINE.tools);
    expect(new Set(REGISTERED_POLITICLAW_TOOL_DOCS.map((entry) => entry.tool.name)).size).toBe(
      DOCS_BASELINE.tools,
    );
  });

  it("tracks the current cron template count", () => {
    expect(POLITICLAW_CRON_TEMPLATES).toHaveLength(DOCS_BASELINE.cronTemplates);
  });

  it("tracks the current storage migration count", () => {
    const migrations = readdirSync(
      join(pluginRoot, "src", "storage", "migrations"),
    ).filter((fileName) => fileName.endsWith(".sql"));
    expect(migrations).toHaveLength(DOCS_BASELINE.migrations);
  });

  it("tracks the current skill count", () => {
    const skills = readdirSync(join(pluginRoot, "skills")).filter(
      (entry) => !entry.startsWith("."),
    );
    expect(skills).toHaveLength(DOCS_BASELINE.skills);
  });

  it("tracks the current state ballot adapter count", () => {
    const adapters = readdirSync(
      join(pluginRoot, "src", "sources", "ballot", "stateSoS"),
    ).filter(
      (fileName) =>
        fileName.endsWith(".ts") &&
        fileName !== "types.ts" &&
        fileName !== "unimplemented.ts",
    );
    expect(adapters).toHaveLength(DOCS_BASELINE.stateBallotAdapters);
  });
});
