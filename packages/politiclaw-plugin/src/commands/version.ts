import type { OpenClawPluginCommandDefinition } from "openclaw/plugin-sdk/plugin-entry";

// resolveJsonModule + NodeNext is enabled in tsconfig; the import attribute
// keeps Node 22's loader happy when the build emits ESM.
import packageJson from "../../package.json" with { type: "json" };

type OpenClawMetadata = {
  compat?: { pluginApi?: string };
  install?: { minHostVersion?: string };
};

export const versionCommand: OpenClawPluginCommandDefinition = {
  name: "politiclaw-version",
  description: "PolitiClaw plugin version and OpenClaw runtime floor.",
  acceptsArgs: false,
  requireAuth: false,
  handler: () => {
    const version = packageJson.version ?? "unknown";
    const meta = (packageJson as { openclaw?: OpenClawMetadata }).openclaw ?? {};
    const compat = meta.compat?.pluginApi ?? "unknown";
    const minHost = meta.install?.minHostVersion ?? "unknown";
    return {
      text: [
        `PolitiClaw ${version}`,
        `Plugin API floor: ${compat}`,
        `Minimum OpenClaw host: ${minHost}`,
      ].join("\n"),
    };
  },
};
