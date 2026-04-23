/**
 * Builds the user-facing "monitoring contract" surfaced at the end of
 * onboarding and from the dashboard / doctor. Translates the implementation
 * surface (cron templates, plugin config, reps cache) into product-shaped
 * facts: what we're watching, what we're not watching and why, what caveats
 * apply, and how to change it.
 *
 * Co-located with the preferences domain so the labels stay consistent with
 * accountability.ts. Pure: takes a DB handle, plugin config snapshot, and an
 * optional cron adapter; never mutates state.
 */

import type { PolitiClawDb } from "../../storage/sqlite.js";
import type { PluginConfigSnapshot } from "../../storage/context.js";
import type { GatewayCronAdapter, GatewayCronJob } from "../../cron/gatewayAdapter.js";
import {
  POLITICLAW_CRON_TEMPLATES,
  templatesForMode,
  type PolitiClawCronTemplate,
} from "../../cron/templates.js";
import { listReps } from "../reps/index.js";
import {
  ACCOUNTABILITY_EXPLAINERS,
  ACCOUNTABILITY_LABELS,
  getPreferences,
  listIssueStances,
  type AccountabilityMode,
  type IssueStanceRow,
  type MonitoringMode,
  type PreferencesRow,
} from "./index.js";

const TOP_STANCE_LIMIT = 5;

const MODE_EXPLAINERS: Record<MonitoringMode, string> = {
  off: "No automated alerts. You can still ask me anything on demand.",
  quiet_watch:
    "Silent background change-detection only. No digests. I only surface tracked-bill or hearing changes when something materially changes.",
  weekly_digest:
    "Weekly digest plus monthly rep report, with background change-detection on bills affecting your issues.",
  action_only:
    "Quiet background change-detection plus election-proximity alerts. No weekly digest or monthly rep report.",
  full_copilot:
    "Everything: weekly digest, monthly rep report, election-proximity alerts, 6-hour bill watch, 12-hour committee-hearings sweep.",
};

export type MonitoringContractStance = {
  issue: string;
  stance: IssueStanceRow["stance"];
  weight: number;
};

export type MonitoringContractActiveJob = {
  name: string;
  cadence: string;
  watchesFor: string;
};

export type InactiveJobReason =
  | "mode_excludes"
  | "missing_api_key"
  | "no_address"
  | "no_reps"
  | "feature_unavailable";

export type MonitoringContractInactiveJob = {
  name: string;
  reason: InactiveJobReason;
  explanation: string;
};

export type MonitoringContract = {
  generatedAt: number;
  address: { line: string; resolved: boolean };
  topStances: MonitoringContractStance[];
  totalStances: number;
  monitoring: {
    mode: MonitoringMode;
    plainEnglish: string;
  };
  accountability: {
    mode: AccountabilityMode;
    label: string;
    plainEnglish: string;
  };
  activeJobs: MonitoringContractActiveJob[];
  inactiveJobs: MonitoringContractInactiveJob[];
  caveats: string[];
  changeHowTo: string;
};

export type BuildMonitoringContractDeps = {
  db: PolitiClawDb;
  config: PluginConfigSnapshot;
  cronAdapter?: GatewayCronAdapter;
  now?: () => number;
};

const STATIC_CAVEATS = [
  "Alerts only reach you on whichever chat surface you most recently used PolitiClaw — there's no email, push, or Slack delivery yet.",
  "Coverage is federal-only right now: no state legislators, no city/county officials.",
];

const SUMMARIES_BY_NAME: Record<string, string> = {
  "politiclaw.weekly_summary":
    "weekly digest of tracked-bill movement, upcoming events, and a dissenting-view item",
  "politiclaw.rep_vote_watch":
    "every 6h, surfaces new or materially changed federal bills crossing your alignment threshold",
  "politiclaw.tracked_hearings":
    "every 12h, sweeps committee hearings for tracked-bill or stance overlap",
  "politiclaw.rep_report":
    "monthly representative alignment report vs. your declared issue stances",
  "politiclaw.election_proximity_alert":
    "daily check; fires only at 30/14/7/1 days before the next election",
};

function summarizeSchedule(template: PolitiClawCronTemplate): string {
  const schedule = template.schedule;
  if (schedule.kind === "every") {
    const ms = schedule.everyMs;
    const days = ms / 86_400_000;
    if (days >= 1 && Number.isInteger(days)) return `every ${days}d`;
    const hours = ms / 3_600_000;
    if (hours >= 1 && Number.isInteger(hours)) return `every ${hours}h`;
    const minutes = ms / 60_000;
    if (minutes >= 1 && Number.isInteger(minutes)) return `every ${minutes}m`;
    return `every ${Math.round(ms / 1000)}s`;
  }
  return schedule.expr;
}

function watchesFor(name: string): string {
  return SUMMARIES_BY_NAME[name] ?? "PolitiClaw monitoring job";
}

/**
 * Templates that depend on `apiDataGov` (federal bills/votes/hearings). When
 * that key is missing, these jobs would fire but their downstream tools would
 * refuse, so we surface them as inactive with `missing_api_key`.
 */
const DATA_GOV_DEPENDENT_NAMES = new Set<string>([
  "politiclaw.weekly_summary",
  "politiclaw.rep_vote_watch",
  "politiclaw.tracked_hearings",
  "politiclaw.rep_report",
]);

export async function buildMonitoringContract(
  deps: BuildMonitoringContractDeps,
): Promise<MonitoringContract> {
  const now = deps.now ?? Date.now;
  const generatedAt = now();
  const prefs = getPreferences(deps.db);
  const stances = listIssueStances(deps.db);
  const repsCount = countReps(deps.db);

  const mode: MonitoringMode = prefs?.monitoringMode ?? "action_only";
  const accountabilityMode: AccountabilityMode = prefs?.accountability ?? "self_serve";

  const installedTemplates = templatesForMode(mode);
  const installedNames = new Set(installedTemplates.map((t) => t.name));

  const apiDataGovPresent = hasApiKey(deps.config, "apiDataGov");
  const googleCivicPresent = hasApiKey(deps.config, "googleCivic");

  const installedJobs = deps.cronAdapter
    ? await safeListJobs(deps.cronAdapter)
    : null;
  const installedById = new Map<string, GatewayCronJob>();
  if (installedJobs) {
    for (const job of installedJobs) installedById.set(job.name, job);
  }

  const activeJobs: MonitoringContractActiveJob[] = [];
  const inactiveJobs: MonitoringContractInactiveJob[] = [];

  for (const template of POLITICLAW_CRON_TEMPLATES) {
    const isInModeSet = installedNames.has(template.name);
    const dataGovDependent = DATA_GOV_DEPENDENT_NAMES.has(template.name);
    const installedJob = installedById.get(template.name);
    const enabledOnGateway = installedJob?.enabled ?? false;

    if (!isInModeSet) {
      inactiveJobs.push({
        name: template.name,
        reason: "mode_excludes",
        explanation: `'${mode}' monitoring mode does not include this job. Switch to a mode that includes it (e.g. 'weekly_digest' or 'full_copilot') to enable it.`,
      });
      continue;
    }

    if (dataGovDependent && !apiDataGovPresent) {
      inactiveJobs.push({
        name: template.name,
        reason: "missing_api_key",
        explanation:
          "Requires the api.data.gov key (plugins.politiclaw.apiKeys.apiDataGov). Without it, federal bill, vote, and hearing tools refuse.",
      });
      continue;
    }

    if (template.name === "politiclaw.election_proximity_alert" && !prefs?.address) {
      inactiveJobs.push({
        name: template.name,
        reason: "no_address",
        explanation:
          "Election lookup needs a saved address. Re-run politiclaw_configure with one.",
      });
      continue;
    }

    if (template.name === "politiclaw.rep_report" && repsCount === 0) {
      inactiveJobs.push({
        name: template.name,
        reason: "no_reps",
        explanation:
          "Rep alignment report needs cached reps. Run politiclaw_get_my_reps once an address is saved.",
      });
      continue;
    }

    if (deps.cronAdapter && installedJob && !enabledOnGateway) {
      inactiveJobs.push({
        name: template.name,
        reason: "feature_unavailable",
        explanation:
          "Job is installed but currently disabled on the gateway. Re-run politiclaw_configure to reconcile or inspect gateway cron state directly.",
      });
      continue;
    }

    activeJobs.push({
      name: template.name,
      cadence: summarizeSchedule(template),
      watchesFor: watchesFor(template.name),
    });
  }

  const caveats: string[] = [];
  for (const c of STATIC_CAVEATS) caveats.push(c);
  if (!googleCivicPresent) {
    caveats.push(
      "Ballot logistics (polling place, contests) need the Google Civic key. Without it, election alerts can still fire on date, but ballot detail is unavailable.",
    );
  }
  if (mode === "off") {
    caveats.push(
      "Monitoring is off — no automated alerts will fire. Anything you want from PolitiClaw needs to be asked on demand.",
    );
  }

  const sortedStances = [...stances].sort((a, b) => {
    if (b.weight !== a.weight) return b.weight - a.weight;
    return a.issue.localeCompare(b.issue);
  });
  const topStances: MonitoringContractStance[] = sortedStances
    .slice(0, TOP_STANCE_LIMIT)
    .map((s) => ({ issue: s.issue, stance: s.stance, weight: s.weight }));

  return {
    generatedAt,
    address: {
      line: prefs?.address ?? "",
      resolved: Boolean(prefs?.address && prefs.address.length > 0),
    },
    topStances,
    totalStances: stances.length,
    monitoring: {
      mode,
      plainEnglish: MODE_EXPLAINERS[mode],
    },
    accountability: {
      mode: accountabilityMode,
      label: ACCOUNTABILITY_LABELS[accountabilityMode],
      plainEnglish: ACCOUNTABILITY_EXPLAINERS[accountabilityMode],
    },
    activeJobs,
    inactiveJobs,
    caveats,
    changeHowTo:
      "To change anything: call politiclaw_configure with the field you want to update (e.g. { stage: 'monitoring', monitoringMode: 'weekly_digest' }), or open the dashboard.",
  };
}

function countReps(db: PolitiClawDb): number {
  try {
    return listReps(db).length;
  } catch {
    return 0;
  }
}

async function safeListJobs(
  adapter: GatewayCronAdapter,
): Promise<GatewayCronJob[]> {
  try {
    return await adapter.list({ includeDisabled: true });
  } catch {
    return [];
  }
}

function hasApiKey(
  config: PluginConfigSnapshot,
  key: keyof NonNullable<PluginConfigSnapshot["apiKeys"]>,
): boolean {
  const value = config.apiKeys?.[key];
  return typeof value === "string" && value.length > 0;
}

export function renderMonitoringContract(contract: MonitoringContract): string {
  const lines: string[] = [];
  lines.push("Your PolitiClaw monitoring contract");
  lines.push("");
  lines.push(
    `- Address: ${contract.address.line || "(none on file — set one to unlock reps and ballot data)"}`,
  );
  if (contract.topStances.length > 0) {
    lines.push(
      `- Top issues (${contract.topStances.length} of ${contract.totalStances}):`,
    );
    for (const s of contract.topStances) {
      lines.push(`    • ${s.issue}: ${s.stance} (weight ${s.weight})`);
    }
  } else {
    lines.push("- Top issues: none declared yet.");
  }
  lines.push(
    `- Monitoring mode: ${contract.monitoring.mode} — ${contract.monitoring.plainEnglish}`,
  );
  lines.push(
    `- Accountability: ${contract.accountability.label} — ${contract.accountability.plainEnglish}`,
  );
  lines.push("");
  if (contract.activeJobs.length > 0) {
    lines.push("Watching:");
    for (const job of contract.activeJobs) {
      lines.push(`  - ${job.name} (${job.cadence}): ${job.watchesFor}`);
    }
  } else {
    lines.push("Watching: nothing automated right now.");
  }
  if (contract.inactiveJobs.length > 0) {
    lines.push("");
    lines.push("Not watching:");
    for (const job of contract.inactiveJobs) {
      lines.push(`  - ${job.name} (${job.reason}): ${job.explanation}`);
    }
  }
  if (contract.caveats.length > 0) {
    lines.push("");
    lines.push("Caveats:");
    for (const c of contract.caveats) {
      lines.push(`  - ${c}`);
    }
  }
  lines.push("");
  lines.push(contract.changeHowTo);
  return lines.join("\n");
}
