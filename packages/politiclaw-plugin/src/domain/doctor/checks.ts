import type { PolitiClawDb } from "../../storage/sqlite.js";
import type { PluginConfigSnapshot } from "../../storage/context.js";
import type { GatewayCronAdapter } from "../../cron/gatewayAdapter.js";
import { POLITICLAW_CRON_NAMES } from "../../cron/templates.js";
import {
  ACCOUNTABILITY_LABELS,
  getPreferences,
} from "../preferences/index.js";
import {
  buildMonitoringContract,
  type MonitoringContract,
} from "../preferences/contract.js";

export type CheckStatus = "ok" | "warn" | "fail";

export type DoctorCheck = {
  id: string;
  label: string;
  status: CheckStatus;
  summary: string;
  actionable?: string;
};

export type DoctorReport = {
  checks: DoctorCheck[];
  worst: CheckStatus;
  generatedAtMs: number;
  monitoringContract: MonitoringContract | null;
};

export type RunDoctorDeps = {
  db: PolitiClawDb;
  config: PluginConfigSnapshot;
  cronAdapter?: GatewayCronAdapter;
  now?: () => number;
};

export async function runDoctor(deps: RunDoctorDeps): Promise<DoctorReport> {
  const now = deps.now ?? Date.now;
  const checks: DoctorCheck[] = [];

  checks.push(checkSchemaVersion(deps.db));
  checks.push(checkDbIntegrity(deps.db));
  checks.push(checkPreferences(deps.db));
  checks.push(checkAccountabilityIntensity(deps.db));
  checks.push(checkApiKeys(deps.config));
  checks.push(checkRepsCoverage(deps.db));
  checks.push(await checkCron(deps.cronAdapter));

  let monitoringContract: MonitoringContract | null = null;
  try {
    monitoringContract = await buildMonitoringContract({
      db: deps.db,
      config: deps.config,
      cronAdapter: deps.cronAdapter,
      now,
    });
  } catch {
    monitoringContract = null;
  }

  return {
    checks,
    worst: worstStatus(checks),
    generatedAtMs: now(),
    monitoringContract,
  };
}

function checkAccountabilityIntensity(db: PolitiClawDb): DoctorCheck {
  try {
    const prefs = getPreferences(db);
    if (!prefs) {
      return {
        id: "accountability_intensity",
        label: "Monitoring mode & accountability",
        status: "warn",
        summary: "No preferences row yet — monitoring and accountability defaults are not in effect.",
        actionable: "Ask the agent to call politiclaw_configure to set them.",
      };
    }
    const accountabilityLabel = ACCOUNTABILITY_LABELS[prefs.accountability];
    return {
      id: "accountability_intensity",
      label: "Monitoring mode & accountability",
      status: "ok",
      summary: `Mode '${prefs.monitoringMode}', accountability '${accountabilityLabel}'.`,
    };
  } catch (error) {
    return failedCheck(
      "accountability_intensity",
      "Monitoring mode & accountability",
      error,
    );
  }
}

function worstStatus(checks: DoctorCheck[]): CheckStatus {
  if (checks.some((c) => c.status === "fail")) return "fail";
  if (checks.some((c) => c.status === "warn")) return "warn";
  return "ok";
}

function checkSchemaVersion(db: PolitiClawDb): DoctorCheck {
  try {
    const row = db
      .prepare("SELECT MAX(version) AS v FROM schema_version")
      .get() as { v: number | null } | undefined;
    const v = row?.v ?? 0;
    if (v <= 0) {
      return {
        id: "schema_version",
        label: "Schema migrations",
        status: "fail",
        summary: "No migrations applied.",
        actionable:
          "Reopen the plugin DB — migrations run on boot and should populate schema_version.",
      };
    }
    return {
      id: "schema_version",
      label: "Schema migrations",
      status: "ok",
      summary: `Schema at version ${v}.`,
    };
  } catch (error) {
    return failedCheck("schema_version", "Schema migrations", error);
  }
}

function checkDbIntegrity(db: PolitiClawDb): DoctorCheck {
  try {
    const row = db.pragma("integrity_check", { simple: true }) as string;
    if (row === "ok") {
      return {
        id: "db_integrity",
        label: "SQLite integrity",
        status: "ok",
        summary: "PRAGMA integrity_check returned ok.",
      };
    }
    return {
      id: "db_integrity",
      label: "SQLite integrity",
      status: "fail",
      summary: `PRAGMA integrity_check returned: ${row}.`,
      actionable:
        "Back up the plugin DB and run a repair pass; corruption here will corrupt downstream queries.",
    };
  } catch (error) {
    return failedCheck("db_integrity", "SQLite integrity", error);
  }
}

function checkPreferences(db: PolitiClawDb): DoctorCheck {
  try {
    const prefs = getPreferences(db);
    if (!prefs) {
      return {
        id: "preferences",
        label: "User preferences",
        status: "warn",
        summary: "No preferences on file.",
        actionable:
          "Ask the agent to call politiclaw_configure with at least an address to unlock reps, ballot, and monitoring.",
      };
    }
    if (!prefs.state || !prefs.zip) {
      return {
        id: "preferences",
        label: "User preferences",
        status: "warn",
        summary: "Preferences missing state or zip.",
        actionable:
          "Ask the agent to call politiclaw_configure with state and zip so ballot/reps adapters can route correctly.",
      };
    }
    return {
      id: "preferences",
      label: "User preferences",
      status: "ok",
      summary: `Preferences on file (state ${prefs.state}).`,
    };
  } catch (error) {
    return failedCheck("preferences", "User preferences", error);
  }
}

export type ApiKeyFlag = {
  key: keyof NonNullable<PluginConfigSnapshot["apiKeys"]>;
  label: string;
  required: boolean;
  unlocks: string;
};

export const API_KEY_FLAGS: readonly ApiKeyFlag[] = [
  {
    key: "apiDataGov",
    label: "api.data.gov",
    required: true,
    unlocks: "federal bills, votes, and FEC finance",
  },
  { key: "geocodio", label: "Geocodio", required: false, unlocks: "faster reps-by-address" },
  { key: "googleCivic", label: "Google Civic", required: false, unlocks: "ballot logistics" },
  { key: "openStates", label: "Open States", required: false, unlocks: "state bills" },
  { key: "voteSmart", label: "Vote Smart", required: false, unlocks: "structured candidate bios" },
];

function checkApiKeys(config: PluginConfigSnapshot): DoctorCheck {
  const keys = config.apiKeys ?? {};
  const missingRequired: string[] = [];
  const missingOptional: string[] = [];
  for (const flag of API_KEY_FLAGS) {
    const present = typeof keys[flag.key] === "string" && keys[flag.key]!.length > 0;
    if (present) continue;
    if (flag.required) missingRequired.push(`${flag.label} (${flag.unlocks})`);
    else missingOptional.push(`${flag.label} (${flag.unlocks})`);
  }
  if (missingRequired.length > 0) {
    return {
      id: "api_keys",
      label: "API keys",
      status: "fail",
      summary: `Missing required key(s): ${missingRequired.join(", ")}.`,
      actionable:
        "Set plugins.entries.politiclaw.config.apiKeys.apiDataGov in the gateway config. Without it, federal bill/vote/finance tools refuse.",
    };
  }
  if (missingOptional.length > 0) {
    return {
      id: "api_keys",
      label: "API keys",
      status: "warn",
      summary: `Optional keys unset: ${missingOptional.join("; ")}.`,
      actionable:
        "These are upgrades, not requirements. Zero-key paths remain functional; add keys to light up structured data.",
    };
  }
  return {
    id: "api_keys",
    label: "API keys",
    status: "ok",
    summary: "All known API keys configured.",
  };
}

function checkRepsCoverage(db: PolitiClawDb): DoctorCheck {
  try {
    const row = db.prepare("SELECT COUNT(*) AS n FROM reps").get() as {
      n: number;
    };
    if (row.n === 0) {
      return {
        id: "reps_cache",
        label: "Reps cache",
        status: "warn",
        summary: "No reps cached yet.",
        actionable:
          "Run politiclaw_get_my_reps once preferences are set to populate the cache.",
      };
    }
    return {
      id: "reps_cache",
      label: "Reps cache",
      status: "ok",
      summary: `${row.n} rep row(s) cached.`,
    };
  } catch (error) {
    return failedCheck("reps_cache", "Reps cache", error);
  }
}

async function checkCron(adapter?: GatewayCronAdapter): Promise<DoctorCheck> {
  if (!adapter) {
    return {
      id: "cron_jobs",
      label: "Monitoring cron jobs",
      status: "warn",
      summary: "Gateway cron adapter not available in this context.",
      actionable:
        "Cron status is only observable from inside the gateway process; re-run doctor from the running plugin.",
    };
  }
  try {
    const jobs = await adapter.list({ includeDisabled: true });
    const ours = jobs.filter((job) => POLITICLAW_CRON_NAMES.includes(job.name));
    if (ours.length === 0) {
      return {
        id: "cron_jobs",
        label: "Monitoring cron jobs",
        status: "warn",
        summary: "No PolitiClaw cron jobs installed.",
        actionable:
          "Ask the agent to call politiclaw_configure to install the default cadence.",
      };
    }
    const disabled = ours.filter((job) => !job.enabled);
    if (disabled.length === ours.length) {
      return {
        id: "cron_jobs",
        label: "Monitoring cron jobs",
        status: "warn",
        summary: `${ours.length} cron job(s) installed but all paused.`,
        actionable:
          "Ask the agent to call politiclaw_configure to re-enable or re-apply the saved cadence.",
      };
    }
    if (disabled.length > 0) {
      return {
        id: "cron_jobs",
        label: "Monitoring cron jobs",
        status: "ok",
        summary: `${ours.length - disabled.length} of ${ours.length} cron job(s) active (cadence excludes ${disabled.length}).`,
      };
    }
    return {
      id: "cron_jobs",
      label: "Monitoring cron jobs",
      status: "ok",
      summary: `${ours.length} cron job(s) active.`,
    };
  } catch (error) {
    return failedCheck("cron_jobs", "Monitoring cron jobs", error);
  }
}

function failedCheck(id: string, label: string, error: unknown): DoctorCheck {
  const message = error instanceof Error ? error.message : String(error);
  return {
    id,
    label,
    status: "fail",
    summary: `Check threw: ${message}`,
    actionable: "This is a plugin-level error; capture the message and open an issue.",
  };
}
