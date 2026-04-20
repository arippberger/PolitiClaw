import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDownloadShapefilesTool } from "./downloadShapefiles.js";
import { configureStorage, resetStorageConfigForTests } from "../storage/context.js";

describe("politiclaw_download_shapefiles tool", () => {
  beforeEach(() => {
    configureStorage(() => "/tmp/politiclaw-tests");
  });

  afterEach(() => {
    resetStorageConfigForTests();
  });

  it("returns primed when a fresh download succeeds", async () => {
    const tool = createDownloadShapefilesTool(async () => ({
      status: "primed",
      manifest: {
        congress: 119,
        tigerYear: 2024,
        downloadedAt: new Date().toISOString(),
        cdSha256: "abc",
        legislatorsSha256: "def",
      },
    }));

    const result = await tool.execute!("call", {}, undefined, undefined);
    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("downloaded and ready");
    expect((result.details as { status: string }).status).toBe("primed");
  });

  it("returns already_fresh when cache is already present", async () => {
    const tool = createDownloadShapefilesTool(async () => ({
      status: "already_fresh",
      manifest: {
        congress: 119,
        tigerYear: 2024,
        downloadedAt: new Date().toISOString(),
        cdSha256: "abc",
        legislatorsSha256: "def",
      },
    }));

    const result = await tool.execute!("call", {}, undefined, undefined);
    expect((result.details as { status: string }).status).toBe("already_fresh");
  });

  it("returns failed status when primer throws", async () => {
    const tool = createDownloadShapefilesTool(async () => {
      throw new Error("network down");
    });
    const result = await tool.execute!("call", {}, undefined, undefined);
    expect((result.details as { status: string }).status).toBe("failed");
  });
});
