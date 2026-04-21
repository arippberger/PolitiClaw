# Generated Tool Reference

This section is generated from the registered runtime tool objects. Current count: 27.

## Preferences and onboarding

Save address data, declare issue stances, and bootstrap the onboarding flow.

- [`politiclaw_set_preferences`](./politiclaw_set_preferences.md) — Save PolitiClaw preferences
- [`politiclaw_get_preferences`](./politiclaw_get_preferences.md) — Load PolitiClaw preferences
- [`politiclaw_record_stance_signal`](./politiclaw_record_stance_signal.md) — Record PolitiClaw stance signal
- [`politiclaw_set_issue_stance`](./politiclaw_set_issue_stance.md) — Set a declared issue stance
- [`politiclaw_list_issue_stances`](./politiclaw_list_issue_stances.md) — List declared issue stances
- [`politiclaw_delete_issue_stance`](./politiclaw_delete_issue_stance.md) — Delete a declared issue stance
- [`politiclaw_set_monitoring_cadence`](./politiclaw_set_monitoring_cadence.md) — Set PolitiClaw monitoring cadence
- [`politiclaw_start_onboarding`](./politiclaw_start_onboarding.md) — Start PolitiClaw onboarding (conversation or quiz)

## Representatives and alignment

Resolve federal representatives, prime local lookup data, and summarize current alignment.

- [`politiclaw_get_my_reps`](./politiclaw_get_my_reps.md) — Get my federal representatives
- [`politiclaw_download_shapefiles`](./politiclaw_download_shapefiles.md) — Download local rep lookup data
- [`politiclaw_score_representative`](./politiclaw_score_representative.md) — Score a representative against your declared stances
- [`politiclaw_rep_report`](./politiclaw_rep_report.md) — Monthly-style representative alignment report for all stored reps

## Bills and votes

Search federal bills, inspect bill details, score bill alignment, and ingest House votes.

- [`politiclaw_search_bills`](./politiclaw_search_bills.md) — Search recent federal bills
- [`politiclaw_get_bill_details`](./politiclaw_get_bill_details.md) — Fetch a single federal bill
- [`politiclaw_score_bill`](./politiclaw_score_bill.md) — Score a bill against your declared stances
- [`politiclaw_ingest_house_votes`](./politiclaw_ingest_house_votes.md) — Ingest recent House roll-call votes

## Ballot and election prep

Fetch ballot data, explain contests, and assemble a single election guide.

- [`politiclaw_get_my_ballot`](./politiclaw_get_my_ballot.md) — Preview ballot logistics and contests for your saved address
- [`politiclaw_explain_my_ballot`](./politiclaw_explain_my_ballot.md) — Explain each contest on your ballot with facts + framing — never a recommendation
- [`politiclaw_prepare_me_for_my_next_election`](./politiclaw_prepare_me_for_my_next_election.md) — Prepare one readable guide for the user's next election

## Monitoring and cadence

Check upcoming federal activity and reconcile the plugin-owned monitoring jobs.

- [`politiclaw_check_upcoming_votes`](./politiclaw_check_upcoming_votes.md) — Check upcoming votes + bill changes since last run
- [`politiclaw_setup_monitoring`](./politiclaw_setup_monitoring.md) — Install PolitiClaw default monitoring cron jobs
- [`politiclaw_pause_monitoring`](./politiclaw_pause_monitoring.md) — Pause all PolitiClaw monitoring cron jobs
- [`politiclaw_resume_monitoring`](./politiclaw_resume_monitoring.md) — Resume paused PolitiClaw monitoring cron jobs

## Candidate research and outreach

Compare candidate finance data, research challengers, and draft constituent outreach.

- [`politiclaw_research_candidate`](./politiclaw_research_candidate.md) — Look up FEC candidate finance totals + tier-5 bio
- [`politiclaw_research_challengers`](./politiclaw_research_challengers.md) — Compare incumbents and challengers by FEC finance totals
- [`politiclaw_draft_letter`](./politiclaw_draft_letter.md) — Draft a letter to a representative

## Operations and diagnostics

Run installation health checks and surface actionable fixes for broken setups.

- [`politiclaw_doctor`](./politiclaw_doctor.md) — Diagnose PolitiClaw install health
