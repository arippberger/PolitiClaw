import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "openclaw/plugin-sdk";
import { join } from "node:path";
import { getStateDir } from "../storage/context.js";
import { primeShapefileCache, type PrimeResult } from "../sources/reps/shapefileCache.js";

const DownloadShapefilesParams = Type.Object({
  force: Type.Optional(
    Type.Boolean({
      description: "When true, re-download and overwrite the cached shapefile bundle.",
    }),
  ),
});

function textResult<T>(text: string, details: T) {
  return { content: [{ type: "text" as const, text }], details };
}

export function createDownloadShapefilesTool(
  primer: (opts: { cacheDir: string; force?: boolean }) => Promise<PrimeResult> = primeShapefileCache,
): AnyAgentTool {
  return {
    name: "politiclaw_download_shapefiles",
    label: "Download local rep lookup data",
    description:
      "Download and cache the zero-key congressional district + legislator data under the plugin state directory.",
    parameters: DownloadShapefilesParams,
    async execute(_toolCallId, rawParams) {
      const params = rawParams as { force?: boolean };
      const stateDir = getStateDir();
      const cacheDir = join(stateDir, "plugins", "politiclaw", "shapefiles");
      try {
        const result = await primer({ cacheDir, force: params.force });
        if (result.status === "already_fresh") {
          return textResult("Shapefile cache already exists and is up to date.", {
            status: "already_fresh",
            manifest: result.manifest,
          });
        }
        return textResult("Shapefile cache downloaded and ready.", {
          status: "primed",
          manifest: result.manifest,
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        return textResult(`Failed to download shapefile cache: ${reason}`, {
          status: "failed",
          reason,
        });
      }
    },
  };
}

export const downloadShapefilesTool = createDownloadShapefilesTool();
export const shapefileTools: AnyAgentTool[] = [downloadShapefilesTool];
