import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseLegislators, resolveFederalReps } from "./legislators.js";

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), "__fixtures__");

describe("legislators parser", () => {
  it("parses active federal terms from yaml", () => {
    const yamlText = readFileSync(join(FIXTURES_DIR, "legislators_subset.yaml"), "utf8");
    const parsed = parseLegislators(yamlText, new Date("2026-04-19T00:00:00Z"));
    expect(parsed.some((item) => item.bioguide === "R000000")).toBe(false);
    expect(parsed.some((item) => item.bioguide === "P000145" && item.office === "US Senate")).toBe(
      true,
    );
    expect(parsed.some((item) => item.bioguide === "P000197" && item.office === "US House")).toBe(
      true,
    );
  });

  it("resolves two senators and one house member by state+district", () => {
    const yamlText = readFileSync(join(FIXTURES_DIR, "legislators_subset.yaml"), "utf8");
    const parsed = parseLegislators(yamlText, new Date("2026-04-19T00:00:00Z"));
    const reps = resolveFederalReps(parsed, { state: "CA", houseDistrict: "11" });
    expect(reps).toHaveLength(3);
    expect(reps.map((rep) => rep.name)).toContain("Alex Padilla");
    expect(reps.map((rep) => rep.name)).toContain("Adam Schiff");
    expect(reps.map((rep) => rep.name)).toContain("Nancy Pelosi");
  });
});
