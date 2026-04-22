# See How My Reps Align

This path is for, "Who represents me, and how have they voted relative to what I care about?"

## Default tools

- [`politiclaw_get_my_reps`](../reference/generated/tools/politiclaw_get_my_reps)
- [`politiclaw_score_representative`](../reference/generated/tools/politiclaw_score_representative)

Use `get_my_reps` to resolve the current delegation, then `score_representative` for the per-rep alignment view.

## Focused follow-ups

- [`politiclaw_rep_report`](../reference/generated/tools/politiclaw_rep_report) for a combined report across stored reps
- [`politiclaw_prepare_me_for_my_next_election`](../reference/generated/tools/politiclaw_prepare_me_for_my_next_election) when the rep context should be folded into ballot prep
- [`politiclaw_draft_letter`](../reference/generated/tools/politiclaw_draft_letter) when the next step is outreach

## Setup prerequisites

Rep scoring depends on declared issue stances. If scores come back as insufficient data, review the stance set with [`politiclaw_list_issue_stances`](../reference/generated/tools/politiclaw_list_issue_stances).
