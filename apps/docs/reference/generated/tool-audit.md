# Generated Tool Audit

This page is generated from the runtime tool registry plus the maintainer-facing visibility audit catalog.

Review question: would a normal user knowingly reach for this tool by name, or is it better treated as a follow-up or implementation detail?

| Tool | Group | Tier | Docs action | Why |
| --- | --- | --- | --- | --- |
| [`politiclaw_configure`](./tools/politiclaw_configure.md) | Configuration and preferences | `core` | `lead-in-guides` | Best first-run and reconfiguration entry point because it folds address setup, rep bootstrap, issue-setup handoff, monitoring cadence, and API key persistence into one user-facing flow. |
| [`politiclaw_issue_stances`](./tools/politiclaw_issue_stances.md) | Configuration and preferences | `core` | `lead-in-guides` | Single tool for setting, listing, and deleting declared issue stances. Directly expresses user priorities and powers bill and rep alignment. |
| [`politiclaw_record_stance_signal`](./tools/politiclaw_record_stance_signal.md) | Configuration and preferences | `internal` | `generated-reference-only` | Low-level preference telemetry for flows and monitoring, not a normal direct user action. |
| [`politiclaw_get_my_reps`](./tools/politiclaw_get_my_reps.md) | Representatives and alignment | `core` | `lead-in-guides` | Directly answers a common question and is foundational to later rep-scoring workflows. |
| [`politiclaw_score_representative`](./tools/politiclaw_score_representative.md) | Representatives and alignment | `core` | `lead-in-guides` | One of the clearest user-value tools: how a rep's federal roll-call votes (House and Senate) line up with declared issues. |
| [`politiclaw_rep_report`](./tools/politiclaw_rep_report.md) | Representatives and alignment | `advanced` | `follow-up-or-advanced-docs` | Batch version of rep scoring, useful for digests and power users more than casual queries. |
| [`politiclaw_search_bills`](./tools/politiclaw_search_bills.md) | Bills and votes | `core` | `lead-in-guides` | Natural first step for bill exploration and a good front door to legislative tracking. |
| [`politiclaw_get_bill_details`](./tools/politiclaw_get_bill_details.md) | Bills and votes | `advanced` | `follow-up-or-advanced-docs` | Detailed inspection tool that is valuable after a bill has already been identified. |
| [`politiclaw_score_bill`](./tools/politiclaw_score_bill.md) | Bills and votes | `core` | `lead-in-guides` | Turns raw bill lookup into a user-relevant answer by mapping it to declared issues. |
| [`politiclaw_ingest_votes`](./tools/politiclaw_ingest_votes.md) | Bills and votes | `internal` | `generated-reference-only` | Data-ingestion plumbing that supports rep scoring but is not a user-facing civic task. |
| [`politiclaw_get_my_ballot`](./tools/politiclaw_get_my_ballot.md) | Ballot and election prep | `internal` | `generated-reference-only` | Raw ballot snapshot is useful as plumbing, but politiclaw_election_brief is the better public entry point. |
| [`politiclaw_election_brief`](./tools/politiclaw_election_brief.md) | Ballot and election prep | `core` | `lead-in-guides` | Best ballot front door because it bundles setup checks, contest framing, and rep context in one readable guide. |
| [`politiclaw_check_upcoming_votes`](./tools/politiclaw_check_upcoming_votes.md) | Monitoring and cadence | `advanced` | `follow-up-or-advanced-docs` | Great for engaged monitoring, but more procedural than the core user journeys. |
| [`politiclaw_mutes`](./tools/politiclaw_mutes.md) | Monitoring and cadence | `advanced` | `follow-up-or-advanced-docs` | Single tool for adding, removing, and listing monitoring mutes — useful tuning control once monitoring is already in use. |
| [`politiclaw_create_reminder`](./tools/politiclaw_create_reminder.md) | Monitoring and cadence | `advanced` | `follow-up-or-advanced-docs` | Proactive bookmark tool used alongside monitoring; helpful for power users tracking a specific vote or election. |
| [`politiclaw_action_moments`](./tools/politiclaw_action_moments.md) | Monitoring and cadence | `advanced` | `follow-up-or-advanced-docs` | Single tool for listing open offer packages and dismissing them with per-offer feedback (useful / not_now / stop) so users can tune action suggestions without muting entire targets. |
| [`politiclaw_research_finance`](./tools/politiclaw_research_finance.md) | Candidate research and outreach | `core` | `lead-in-guides` | Directly maps to common election questions: per-candidate FEC finance lookup or side-by-side challenger comparison for stored reps. |
| [`politiclaw_draft_outreach`](./tools/politiclaw_draft_outreach.md) | Candidate research and outreach | `core` | `lead-in-guides` | Clear outcome-oriented action that follows naturally from bills, reps, and issue stances. Single tool covering both letter and call-script formats. |
| [`politiclaw_doctor`](./tools/politiclaw_doctor.md) | Operations and diagnostics | `core` | `lead-in-guides` | Best recovery entry point when anything about setup, data, or monitoring looks broken. |

## Tier meanings

- `core`: belongs in primary task-based guides and should be treated as a default entry point.
- `advanced`: useful, but better as a follow-up or power-user move.
- `internal`: keep available and documented, but avoid leading users to it in primary docs.

## Docs action meanings

- `lead-in-guides`: surface in onboarding, task pages, and user-facing navigation.
- `follow-up-or-advanced-docs`: keep visible for deeper workflows, but not as the default front door.
- `generated-reference-only`: keep in generated reference and maintainer docs unless there is a specific reason to surface it.