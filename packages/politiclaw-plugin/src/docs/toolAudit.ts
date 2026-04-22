export type ToolVisibilityTier = "core" | "advanced" | "internal";

export type ToolDocsAction =
  | "lead-in-guides"
  | "follow-up-or-advanced-docs"
  | "generated-reference-only";

export type ToolAuditEntry = {
  name: string;
  tier: ToolVisibilityTier;
  docsAction: ToolDocsAction;
  rationale: string;
};

export const TOOL_AUDIT_ENTRIES: readonly ToolAuditEntry[] = [
  {
    name: "politiclaw_set_preferences",
    tier: "core",
    docsAction: "lead-in-guides",
    rationale: "Essential first-run setup that unlocks reps, ballot lookup, and election prep.",
  },
  {
    name: "politiclaw_get_preferences",
    tier: "internal",
    docsAction: "generated-reference-only",
    rationale: "State inspection helper, useful for debugging but rarely a user goal by itself.",
  },
  {
    name: "politiclaw_record_stance_signal",
    tier: "internal",
    docsAction: "generated-reference-only",
    rationale: "Low-level preference telemetry for flows and monitoring, not a normal direct user action.",
  },
  {
    name: "politiclaw_set_issue_stance",
    tier: "core",
    docsAction: "lead-in-guides",
    rationale: "Directly expresses user priorities and powers bill and rep alignment.",
  },
  {
    name: "politiclaw_list_issue_stances",
    tier: "advanced",
    docsAction: "follow-up-or-advanced-docs",
    rationale: "Useful for reviewing and tuning saved preferences after onboarding.",
  },
  {
    name: "politiclaw_delete_issue_stance",
    tier: "advanced",
    docsAction: "follow-up-or-advanced-docs",
    rationale: "Cleanup control for users editing their stance set, but not part of the default flow.",
  },
  {
    name: "politiclaw_set_monitoring_cadence",
    tier: "core",
    docsAction: "lead-in-guides",
    rationale: "Best user-facing control for how loud ongoing monitoring should be.",
  },
  {
    name: "politiclaw_start_onboarding",
    tier: "core",
    docsAction: "lead-in-guides",
    rationale: "Primary setup entry point that hides several lower-level preference tools behind one flow.",
  },
  {
    name: "politiclaw_get_my_reps",
    tier: "core",
    docsAction: "lead-in-guides",
    rationale: "Directly answers a common question and is foundational to later rep-scoring workflows.",
  },
  {
    name: "politiclaw_download_shapefiles",
    tier: "internal",
    docsAction: "generated-reference-only",
    rationale: "Operational helper for the zero-key rep lookup path, not something most users should think about.",
  },
  {
    name: "politiclaw_score_representative",
    tier: "core",
    docsAction: "lead-in-guides",
    rationale: "One of the clearest user-value tools: how a rep's House votes line up with declared issues.",
  },
  {
    name: "politiclaw_rep_report",
    tier: "advanced",
    docsAction: "follow-up-or-advanced-docs",
    rationale: "Batch version of rep scoring, useful for digests and power users more than casual queries.",
  },
  {
    name: "politiclaw_search_bills",
    tier: "core",
    docsAction: "lead-in-guides",
    rationale: "Natural first step for bill exploration and a good front door to legislative tracking.",
  },
  {
    name: "politiclaw_get_bill_details",
    tier: "advanced",
    docsAction: "follow-up-or-advanced-docs",
    rationale: "Detailed inspection tool that is valuable after a bill has already been identified.",
  },
  {
    name: "politiclaw_score_bill",
    tier: "core",
    docsAction: "lead-in-guides",
    rationale: "Turns raw bill lookup into a user-relevant answer by mapping it to declared issues.",
  },
  {
    name: "politiclaw_ingest_house_votes",
    tier: "internal",
    docsAction: "generated-reference-only",
    rationale: "Data-ingestion plumbing that supports rep scoring but is not a user-facing civic task.",
  },
  {
    name: "politiclaw_get_my_ballot",
    tier: "internal",
    docsAction: "generated-reference-only",
    rationale: "Raw ballot snapshot is useful as plumbing, but the higher-level ballot tools are better public entry points.",
  },
  {
    name: "politiclaw_explain_my_ballot",
    tier: "advanced",
    docsAction: "follow-up-or-advanced-docs",
    rationale: "Valuable for focused ballot deep dives, but narrower than the full election guide.",
  },
  {
    name: "politiclaw_prepare_me_for_my_next_election",
    tier: "core",
    docsAction: "lead-in-guides",
    rationale: "Best ballot front door because it bundles setup checks, contest framing, and rep context.",
  },
  {
    name: "politiclaw_check_upcoming_votes",
    tier: "advanced",
    docsAction: "follow-up-or-advanced-docs",
    rationale: "Great for engaged monitoring, but more procedural than the core user journeys.",
  },
  {
    name: "politiclaw_setup_monitoring",
    tier: "internal",
    docsAction: "generated-reference-only",
    rationale: "Operator-style reconciliation tool that is superseded for most users by cadence selection.",
  },
  {
    name: "politiclaw_pause_monitoring",
    tier: "internal",
    docsAction: "generated-reference-only",
    rationale: "Administrative control for installed jobs, not the preferred everyday monitoring UX.",
  },
  {
    name: "politiclaw_resume_monitoring",
    tier: "internal",
    docsAction: "generated-reference-only",
    rationale: "Administrative control for installed jobs, not the preferred everyday monitoring UX.",
  },
  {
    name: "politiclaw_mute",
    tier: "advanced",
    docsAction: "follow-up-or-advanced-docs",
    rationale: "Useful tuning control once monitoring is already in use.",
  },
  {
    name: "politiclaw_unmute",
    tier: "advanced",
    docsAction: "follow-up-or-advanced-docs",
    rationale: "Complements mute management for returning users, but not part of onboarding or first-run paths.",
  },
  {
    name: "politiclaw_list_mutes",
    tier: "advanced",
    docsAction: "follow-up-or-advanced-docs",
    rationale: "Audit view for monitoring suppressions, relevant mainly after custom tuning.",
  },
  {
    name: "politiclaw_research_candidate",
    tier: "core",
    docsAction: "lead-in-guides",
    rationale: "Directly maps to a common election question and offers strong standalone value.",
  },
  {
    name: "politiclaw_research_challengers",
    tier: "advanced",
    docsAction: "follow-up-or-advanced-docs",
    rationale: "Helpful side-by-side race view, but more specialized than single-candidate research.",
  },
  {
    name: "politiclaw_draft_letter",
    tier: "core",
    docsAction: "lead-in-guides",
    rationale: "Clear outcome-oriented action that follows naturally from bills, reps, and issue stances.",
  },
  {
    name: "politiclaw_doctor",
    tier: "core",
    docsAction: "lead-in-guides",
    rationale: "Best recovery entry point when anything about setup, data, or monitoring looks broken.",
  },
] as const;
