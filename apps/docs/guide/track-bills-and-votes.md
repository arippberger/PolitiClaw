# Track Bills and Votes

This path is for, "What is happening in Congress, and how much should I care?"

Federal vote coverage spans both chambers today: House votes through `api.congress.gov` and Senate votes through `voteview.com` — see [current coverage](../reference/source-coverage#what-is-not-covered-today).

## Default tools

- [`politiclaw_search_bills`](../reference/generated/tools/politiclaw_search_bills)
- [`politiclaw_score_bill`](../reference/generated/tools/politiclaw_score_bill)

Use `search_bills` to find the bill, then `score_bill` to map it to the user's declared issue set.

## Focused follow-ups

- [`politiclaw_get_bill_details`](../reference/generated/tools/politiclaw_get_bill_details) for the full source-backed detail page
- [`politiclaw_check_upcoming_votes`](../reference/generated/tools/politiclaw_check_upcoming_votes) for a manual monitoring snapshot
- [`politiclaw_configure`](../reference/generated/tools/politiclaw_configure) for ongoing alerts instead of one-off checks

## Good supporting setup

Bill scoring works best after the user has declared issue stances with [`politiclaw_configure`](../reference/generated/tools/politiclaw_configure) or [`politiclaw_issue_stances`](../reference/generated/tools/politiclaw_issue_stances).

## In the accountability loop

This page is the evidence side of the loop — bills and votes are what rep scoring runs against. The rest of the loop:

- [How PolitiClaw Holds Representatives Accountable](./rep-accountability) — the full loop with the diagram, the dissenting-view rule, and source-tier discipline.
- [See How My Reps Align](./see-how-my-reps-align) — the operational entry point that turns bill/vote evidence into per-rep alignment.
- [Examples of Good Alerts](./example-alerts) — what the recurring monitoring jobs produce when bill movement crosses the confidence floor.
