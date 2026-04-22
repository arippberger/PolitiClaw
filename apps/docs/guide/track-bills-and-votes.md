# Track Bills and Votes

This path is for, "What is happening in Congress, and how much should I care?"

## Default tools

- [`politiclaw_search_bills`](../reference/generated/tools/politiclaw_search_bills)
- [`politiclaw_score_bill`](../reference/generated/tools/politiclaw_score_bill)

Use `search_bills` to find the bill, then `score_bill` to map it to the user's declared issue set.

## Focused follow-ups

- [`politiclaw_get_bill_details`](../reference/generated/tools/politiclaw_get_bill_details) for the full source-backed detail page
- [`politiclaw_check_upcoming_votes`](../reference/generated/tools/politiclaw_check_upcoming_votes) for a manual monitoring snapshot
- [`politiclaw_set_monitoring_cadence`](../reference/generated/tools/politiclaw_set_monitoring_cadence) for ongoing alerts instead of one-off checks

## Good supporting setup

Bill scoring works best after the user has declared issue stances with [`politiclaw_start_onboarding`](../reference/generated/tools/politiclaw_start_onboarding) or [`politiclaw_set_issue_stance`](../reference/generated/tools/politiclaw_set_issue_stance).
