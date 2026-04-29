# Generated Tool Reference

This section is generated from the registered runtime tool objects. Current count: 19.

## Configuration and preferences

Configure the plugin, declare issue stances, and manage the saved preference data that remains user-facing.

- [`politiclaw_configure`](./politiclaw_configure.md) — Configure PolitiClaw
- [`politiclaw_issue_stances`](./politiclaw_issue_stances.md) — Manage declared issue stances (set, list, delete)
- [`politiclaw_record_stance_signal`](./politiclaw_record_stance_signal.md) — Record PolitiClaw stance signal

## Representatives and alignment

Resolve federal representatives and summarize current alignment.

- [`politiclaw_get_my_reps`](./politiclaw_get_my_reps.md) — Get my federal representatives
- [`politiclaw_score_representative`](./politiclaw_score_representative.md) — Did this representative represent the stances you declared?
- [`politiclaw_rep_report`](./politiclaw_rep_report.md) — Did your delegation represent the stances you declared?

## Bills and votes

Search federal bills, inspect bill details, score bill alignment, and ingest House and Senate roll-call votes.

- [`politiclaw_search_bills`](./politiclaw_search_bills.md) — Search recent federal bills
- [`politiclaw_get_bill_details`](./politiclaw_get_bill_details.md) — Fetch a single federal bill
- [`politiclaw_score_bill`](./politiclaw_score_bill.md) — Score a bill against your declared stances
- [`politiclaw_ingest_votes`](./politiclaw_ingest_votes.md) — Ingest recent congressional roll-call votes

## Ballot and election prep

Fetch ballot data and assemble a single readable election guide.

- [`politiclaw_get_my_ballot`](./politiclaw_get_my_ballot.md) — Preview ballot logistics and contests for your saved address
- [`politiclaw_election_brief`](./politiclaw_election_brief.md) — One readable election guide: ballot framing + rep alignment + setup checks

## Monitoring and cadence

Check upcoming federal activity and manage alert suppression once configuration is complete.

- [`politiclaw_check_upcoming_votes`](./politiclaw_check_upcoming_votes.md) — Check upcoming votes + bill changes since last run
- [`politiclaw_mutes`](./politiclaw_mutes.md) — Manage monitoring alert mutes (add, remove, list)
- [`politiclaw_create_reminder`](./politiclaw_create_reminder.md) — Create a reminder anchored to a bill, event, or election
- [`politiclaw_action_moments`](./politiclaw_action_moments.md) — List or dismiss open action-package offers

## Candidate research and outreach

Compare candidate finance data and draft constituent outreach (letter or call script).

- [`politiclaw_research_finance`](./politiclaw_research_finance.md) — Research candidate finance — single candidate or side-by-side challengers
- [`politiclaw_draft_outreach`](./politiclaw_draft_outreach.md) — Draft a letter or call script for a representative

## Operations and diagnostics

Run installation health checks and surface actionable fixes for broken setups.

- [`politiclaw_doctor`](./politiclaw_doctor.md) — Diagnose PolitiClaw install health
