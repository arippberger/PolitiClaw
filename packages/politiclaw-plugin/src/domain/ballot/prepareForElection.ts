/**
 * Meta-composition for "one call, full election guide."
 *
 * Composes:
 *   - preferences (address + stances)
 *   - stored reps
 *   - `explainMyBallot` (per-contest framing + bios)
 *   - `scoreRepresentative` for each stored rep
 *
 * Prerequisite checks return a structured `setup_needed` result rather than
 * throwing — the skill is expected to forward the `actionable` guidance to
 * the user (e.g. "call politiclaw_configure first"). Adapter-level
 * "unavailable" outcomes from the ballot resolver degrade gracefully into
 * the same shape so the renderer can present one coherent state instead of
 * partial data with a stack trace.
 */

import type { PolitiClawDb } from "../../storage/sqlite.js";
import type { BallotResolver } from "../../sources/ballot/index.js";
import type { WebSearchResolver } from "../../sources/webSearch/index.js";
import {
  createActionPackage,
  electionDaysBucket,
  hashDecisionInputs,
} from "../actionMoments/index.js";
import { getPreferences } from "../preferences/index.js";
import type { PreferencesRow } from "../preferences/types.js";
import { listReps, type StoredRep } from "../reps/index.js";
import { listIssueStances } from "../preferences/index.js";
import {
  scoreRepresentative,
  type ScoreRepresentativeResult,
} from "../scoring/index.js";
import { explainMyBallot, type ExplainMyBallotResult } from "./explain.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type PrepareForElectionOptions = {
  refresh?: boolean;
  webSearch?: WebSearchResolver;
};

export type PrepareForElectionResult =
  | {
      status: "setup_needed";
      missing: SetupStep[];
    }
  | {
      status: "ballot_unavailable";
      reason: string;
      actionable?: string;
      adapterId?: string;
    }
  | {
      status: "ok";
      preferences: PreferencesRow;
      ballot: Extract<ExplainMyBallotResult, { status: "ok" }>;
      reps: readonly StoredRep[];
      repScores: readonly RepScoreEntry[];
    };

export type SetupStep = {
  id: "preferences" | "reps" | "stances";
  reason: string;
  actionable: string;
};

export type RepScoreEntry = {
  rep: StoredRep;
  result: ScoreRepresentativeResult;
};

export async function prepareForElection(
  db: PolitiClawDb,
  resolver: BallotResolver,
  options: PrepareForElectionOptions = {},
): Promise<PrepareForElectionResult> {
  const preferences = getPreferences(db);
  const stances = listIssueStances(db);
  const reps = listReps(db);

  const missing: SetupStep[] = [];
  if (!preferences) {
    missing.push({
      id: "preferences",
      reason: "no saved address",
      actionable: "call politiclaw_configure with the user's street address",
    });
  }
  if (reps.length === 0) {
    missing.push({
      id: "reps",
      reason: "no stored representatives",
      actionable: "call politiclaw_get_my_reps to populate the rep cache",
    });
  }
  if (stances.length === 0) {
    missing.push({
      id: "stances",
      reason: "no declared issue stances",
      actionable: "call politiclaw_configure to set them up",
    });
  }

  if (missing.length > 0) {
    return { status: "setup_needed", missing };
  }

  const ballot = await explainMyBallot(db, resolver, {
    refresh: options.refresh,
    webSearch: options.webSearch,
  });

  if (ballot.status !== "ok") {
    if (ballot.status === "unavailable") {
      return {
        status: "ballot_unavailable",
        reason: ballot.reason,
        actionable: ballot.actionable,
        adapterId: ballot.adapterId,
      };
    }
    // no_preferences / no_stances should have been caught above; if they
    // slipped through (race on the DB, etc.) surface them as setup_needed.
    return {
      status: "setup_needed",
      missing: [
        {
          id: ballot.status === "no_preferences" ? "preferences" : "stances",
          reason: ballot.reason,
          actionable: ballot.actionable,
        },
      ],
    };
  }

  const repScores: RepScoreEntry[] = reps.map((rep) => ({
    rep,
    result: scoreRepresentative(db, rep.id),
  }));

  recordElectionPrepPackage(db, ballot);

  return {
    status: "ok",
    preferences: preferences!,
    ballot,
    reps,
    repScores,
  };
}

function recordElectionPrepPackage(
  db: PolitiClawDb,
  ballot: Extract<ExplainMyBallotResult, { status: "ok" }>,
): void {
  const electionDay = ballot.election?.electionDay;
  if (!electionDay) return;
  const toMs = Date.parse(electionDay);
  if (Number.isNaN(toMs)) return;
  const now = Date.now();
  const daysToElection = Math.ceil((toMs - now) / MS_PER_DAY);
  const bucket = electionDaysBucket(daysToElection);
  if (bucket === null) return;

  const decisionHash = hashDecisionInputs({
    triggerClass: "election_proximity",
    electionDate: electionDay,
    daysBucket: bucket,
  });

  createActionPackage(db, {
    triggerClass: "election_proximity",
    packageKind: "election_prep_prompt",
    outreachMode: null,
    billId: null,
    repId: null,
    issue: null,
    electionDate: electionDay,
    decisionHash,
    summary: `Your election is ${bucket === 1 ? "tomorrow" : `${bucket} days out`}${
      ballot.election?.name ? ` — ${ballot.election.name}` : ""
    }.`,
    sourceAdapterId: ballot.ballotSource.adapterId,
    sourceTier: ballot.ballotSource.tier,
    now,
  });
}
