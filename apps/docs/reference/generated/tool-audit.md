# Generated Tool Audit

This page is generated from the runtime tool registry plus the maintainer-facing visibility audit catalog.

Review question: would a normal user knowingly reach for this tool by name, or is it better treated as a follow-up or implementation detail?

| Tool | Group | Tier | Docs action | Why |
| --- | --- | --- | --- | --- |
| [`politiclaw_configure`](./tools/politiclaw_configure.md) | Configuration and preferences | `core` | `lead-in-guides` | Best first-run and reconfiguration entry point because it folds address setup, rep bootstrap, issue-setup handoff, and monitoring cadence into one user-facing flow. |
| [`politiclaw_record_stance_signal`](./tools/politiclaw_record_stance_signal.md) | Configuration and preferences | `internal` | `generated-reference-only` | Low-level preference telemetry for flows and monitoring, not a normal direct user action. |
| [`politiclaw_set_issue_stance`](./tools/politiclaw_set_issue_stance.md) | Configuration and preferences | `core` | `lead-in-guides` | Directly expresses user priorities and powers bill and rep alignment. |
| [`politiclaw_list_issue_stances`](./tools/politiclaw_list_issue_stances.md) | Configuration and preferences | `advanced` | `follow-up-or-advanced-docs` | Useful for reviewing and tuning saved preferences after onboarding. |
| [`politiclaw_delete_issue_stance`](./tools/politiclaw_delete_issue_stance.md) | Configuration and preferences | `advanced` | `follow-up-or-advanced-docs` | Cleanup control for users editing their stance set, but not part of the default flow. |
| [`politiclaw_get_my_reps`](./tools/politiclaw_get_my_reps.md) | Representatives and alignment | `core` | `lead-in-guides` | Directly answers a common question and is foundational to later rep-scoring workflows. |
| [`politiclaw_score_representative`](./tools/politiclaw_score_representative.md) | Representatives and alignment | `core` | `lead-in-guides` | One of the clearest user-value tools: how a rep's House votes line up with declared issues. |
| [`politiclaw_rep_report`](./tools/politiclaw_rep_report.md) | Representatives and alignment | `advanced` | `follow-up-or-advanced-docs` | Batch version of rep scoring, useful for digests and power users more than casual queries. |
| [`politiclaw_search_bills`](./tools/politiclaw_search_bills.md) | Bills and votes | `core` | `lead-in-guides` | Natural first step for bill exploration and a good front door to legislative tracking. |
| [`politiclaw_get_bill_details`](./tools/politiclaw_get_bill_details.md) | Bills and votes | `advanced` | `follow-up-or-advanced-docs` | Detailed inspection tool that is valuable after a bill has already been identified. |
| [`politiclaw_score_bill`](./tools/politiclaw_score_bill.md) | Bills and votes | `core` | `lead-in-guides` | Turns raw bill lookup into a user-relevant answer by mapping it to declared issues. |
| [`politiclaw_ingest_votes`](./tools/politiclaw_ingest_votes.md) | Bills and votes | `internal` | `generated-reference-only` | Data-ingestion plumbing that supports rep scoring but is not a user-facing civic task. |
| [`politiclaw_get_my_ballot`](./tools/politiclaw_get_my_ballot.md) | Ballot and election prep | `internal` | `generated-reference-only` | Raw ballot snapshot is useful as plumbing, but the higher-level ballot tools are better public entry points. |
| [`politiclaw_explain_my_ballot`](./tools/politiclaw_explain_my_ballot.md) | Ballot and election prep | `advanced` | `follow-up-or-advanced-docs` | Valuable for focused ballot deep dives, but narrower than the full election guide. |
| [`politiclaw_prepare_me_for_my_next_election`](./tools/politiclaw_prepare_me_for_my_next_election.md) | Ballot and election prep | `core` | `lead-in-guides` | Best ballot front door because it bundles setup checks, contest framing, and rep context. |
| [`politiclaw_check_upcoming_votes`](./tools/politiclaw_check_upcoming_votes.md) | Monitoring and cadence | `advanced` | `follow-up-or-advanced-docs` | Great for engaged monitoring, but more procedural than the core user journeys. |
| [`politiclaw_mute`](./tools/politiclaw_mute.md) | Monitoring and cadence | `advanced` | `follow-up-or-advanced-docs` | Useful tuning control once monitoring is already in use. |
| [`politiclaw_unmute`](./tools/politiclaw_unmute.md) | Monitoring and cadence | `advanced` | `follow-up-or-advanced-docs` | Complements mute management for returning users, but not part of onboarding or first-run paths. |
| [`politiclaw_list_mutes`](./tools/politiclaw_list_mutes.md) | Monitoring and cadence | `advanced` | `follow-up-or-advanced-docs` | Audit view for monitoring suppressions, relevant mainly after custom tuning. |
| [`politiclaw_create_reminder`](./tools/politiclaw_create_reminder.md) | Monitoring and cadence | `advanced` | `follow-up-or-advanced-docs` | Proactive bookmark tool used alongside monitoring; helpful for power users tracking a specific vote or election. |
| [`politiclaw_list_action_moments`](./tools/politiclaw_list_action_moments.md) | Monitoring and cadence | `advanced` | `follow-up-or-advanced-docs` | Surfaces open offer packages the classifier queued — an audit view for the action-moment pipeline. |
| [`politiclaw_dismiss_action_package`](./tools/politiclaw_dismiss_action_package.md) | Monitoring and cadence | `advanced` | `follow-up-or-advanced-docs` | Per-offer feedback control (not_now / stop / useful) so users can tune action suggestions without muting entire targets. |
| [`politiclaw_research_candidate`](./tools/politiclaw_research_candidate.md) | Candidate research and outreach | `core` | `lead-in-guides` | Directly maps to a common election question and offers strong standalone value. |
| [`politiclaw_research_challengers`](./tools/politiclaw_research_challengers.md) | Candidate research and outreach | `advanced` | `follow-up-or-advanced-docs` | Helpful side-by-side race view, but more specialized than single-candidate research. |
| [`politiclaw_draft_letter`](./tools/politiclaw_draft_letter.md) | Candidate research and outreach | `core` | `lead-in-guides` | Clear outcome-oriented action that follows naturally from bills, reps, and issue stances. |
| [`politiclaw_draft_call_script`](./tools/politiclaw_draft_call_script.md) | Candidate research and outreach | `advanced` | `follow-up-or-advanced-docs` | Phone sibling of the letter drafter — valuable when a faster channel fits but secondary to letters in the default flow. |
| [`politiclaw_doctor`](./tools/politiclaw_doctor.md) | Operations and diagnostics | `core` | `lead-in-guides` | Best recovery entry point when anything about setup, data, or monitoring looks broken. |

## Tier meanings

- `core`: belongs in primary task-based guides and should be treated as a default entry point.
- `advanced`: useful, but better as a follow-up or power-user move.
- `internal`: keep available and documented, but avoid leading users to it in primary docs.

## Docs action meanings

- `lead-in-guides`: surface in onboarding, task pages, and user-facing navigation.
- `follow-up-or-advanced-docs`: keep visible for deeper workflows, but not as the default front door.
- `generated-reference-only`: keep in generated reference and maintainer docs unless there is a specific reason to surface it.