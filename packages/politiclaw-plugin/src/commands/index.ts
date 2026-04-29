import type { OpenClawPluginCommandDefinition } from "openclaw/plugin-sdk/plugin-entry";

import { doctorCommand } from "./doctor.js";
import { helpCommand } from "./help.js";
import { keysCommand } from "./keys.js";
import { setupCommand } from "./setup.js";
import { statusCommand } from "./status.js";
import { versionCommand } from "./version.js";

export const REGISTERED_POLITICLAW_COMMANDS: readonly OpenClawPluginCommandDefinition[] =
  [
    helpCommand,
    setupCommand,
    statusCommand,
    doctorCommand,
    keysCommand,
    versionCommand,
  ];

export {
  doctorCommand,
  helpCommand,
  keysCommand,
  setupCommand,
  statusCommand,
  versionCommand,
};
