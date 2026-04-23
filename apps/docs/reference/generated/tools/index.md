# Generated Tool Reference

This section is generated from the registered runtime tool objects. Current count: 27.

## Configuration and preferences

Configure the plugin, declare issue stances, and manage the saved preference data that remains user-facing.

- [`politiclaw_configure`](./politiclaw_configure.md) — Configure PolitiClaw
- [`politiclaw_record_stance_signal`](./politiclaw_record_stance_signal.md) — Record PolitiClaw stance signal
- [`politiclaw_set_issue_stance`](./politiclaw_set_issue_stance.md) — Set a declared issue stance
- [`politiclaw_list_issue_stances`](./politiclaw_list_issue_stances.md) — List declared issue stances
- [`politiclaw_delete_issue_stance`](./politiclaw_delete_issue_stance.md) — Delete a declared issue stance

## Representatives and alignment

Resolve federal representatives and summarize current alignment.

- [`politiclaw_get_my_reps`](./politiclaw_get_my_reps.md) — Get my federal representatives
- [`politiclaw_score_representative`](./politiclaw_score_representative.md) — Did this representative represent the stances you declared?
- [`politiclaw_rep_report`](./politiclaw_rep_report.md) — Did your delegation represent the stances you declared?

## Bills and votes

Search federal bills, inspect bill details, score bill alignment, and ingest House votes.

- [`politiclaw_search_bills`](./politiclaw_search_bills.md) — Search recent federal bills
- [`politiclaw_get_bill_details`](./politiclaw_get_bill_details.md) — Fetch a single federal bill
- [`politiclaw_score_bill`](./politiclaw_score_bill.md) — Score a bill against your declared stances
- [`politiclaw_ingest_votes`](./politiclaw_ingest_votes.md) — Ingest recent congressional roll-call votes

## Ballot and election prep

Fetch ballot data, explain contests, and assemble a single election guide.

- [`politiclaw_get_my_ballot`](./politiclaw_get_my_ballot.md) — Preview ballot logistics and contests for your saved address
- [`politiclaw_explain_my_ballot`](./politiclaw_explain_my_ballot.md) — Explain each contest on your ballot with facts + framing — never a recommendation
- [`politiclaw_prepare_me_for_my_next_election`](./politiclaw_prepare_me_for_my_next_election.md) — Prepare one readable guide for the user's next election

## Monitoring and cadence

Check upcoming federal activity and manage alert suppression once configuration is complete.

- [`politiclaw_check_upcoming_votes`](./politiclaw_check_upcoming_votes.md) — Check upcoming votes + bill changes since last run
- [`politiclaw_mute`](./politiclaw_mute.md) — Mute a bill, rep, or issue
- [`politiclaw_unmute`](./politiclaw_unmute.md) — Unmute a bill, rep, or issue
- [`politiclaw_list_mutes`](./politiclaw_list_mutes.md) — List current mutes
- [`politiclaw_create_reminder`](./politiclaw_create_reminder.md) — Create a reminder anchored to a bill, event, or election
- [`politiclaw_list_action_moments`](./politiclaw_list_action_moments.md) — List open action-package offers
- [`politiclaw_dismiss_action_package`](./politiclaw_dismiss_action_package.md) — Dismiss or flag an action package

## Candidate research and outreach

Compare candidate finance data, research challengers, and draft constituent outreach.

- [`politiclaw_research_candidate`](./politiclaw_research_candidate.md) — Look up FEC candidate finance totals + tier-5 bio
- [`politiclaw_research_challengers`](./politiclaw_research_challengers.md) — Compare incumbents and challengers by FEC finance totals
- [`politiclaw_draft_letter`](./politiclaw_draft_letter.md) — Draft a letter to a representative
- [`politiclaw_draft_call_script`](./politiclaw_draft_call_script.md) — Draft a short call script for a rep's office

## Operations and diagnostics

Run installation health checks and surface actionable fixes for broken setups.

- [`politiclaw_doctor`](./politiclaw_doctor.md) — Diagnose PolitiClaw install health
