import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createBillsResolver } from "./index.js";

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), "__fixtures__");

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, name), "utf8"));
}

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    async json() {
      return body;
    },
  } as unknown as Response;
}

describe("bills resolver", () => {
  it("uses congressGov when apiDataGov key is configured", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse(fixture("congress_bill_list_119_hr_2026-04-18.json")),
    );
    const resolver = createBillsResolver({ apiDataGovKey: "k", fetcher });

    const result = await resolver.list({ congress: 119, billType: "HR" });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.adapterId).toBe("congressGov");
    expect(result.tier).toBe(1);
    expect(result.data).toHaveLength(3);
    expect(resolver.adapterIds()).toEqual(["congressGov"]);
  });

  it("returns structured unavailable without any configured adapter", async () => {
    const resolver = createBillsResolver({});
    const listResult = await resolver.list({ congress: 119, billType: "HR" });
    const getResult = await resolver.get({ congress: 119, billType: "HR", number: "1234" });

    expect(listResult.status).toBe("unavailable");
    expect(getResult.status).toBe("unavailable");
    if (listResult.status !== "unavailable") return;
    expect(listResult.adapterId).toBe("bills");
    expect(listResult.actionable).toContain("apiDataGov");
  });
});
