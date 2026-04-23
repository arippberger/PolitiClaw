# See How My Reps Align

*Did your representatives represent the stances you declared?* This is the accountability spine of PolitiClaw: everything else (bills, ballots, monitoring, outreach) feeds into or off of the answer.

The workflow is deterministic — there is no LLM judgment about how a rep "really feels" about an issue. You declare stances with weights, PolitiClaw matches those stances to bills by subject and title, you record agree/disagree signals on specific bills, and your rep's House roll-call votes are counted for or against your direction. Scores below the confidence floor surface as *insufficient data*, never as a false percentage.

Rep coverage is US House and US Senate only; state-legislative and local offices are not resolved — see [current coverage](../reference/source-coverage#what-is-not-covered-today).

## Default tools

- [`politiclaw_get_my_reps`](../reference/generated/tools/politiclaw_get_my_reps) — resolve your current federal delegation from your saved address.
- [`politiclaw_score_representative`](../reference/generated/tools/politiclaw_score_representative) — per-issue alignment for one rep, with cited aligned/conflicted bills.
- [`politiclaw_rep_report`](../reference/generated/tools/politiclaw_rep_report) — recompute the whole delegation in one pass; intended for the monthly accountability digest.

Chain them in order: `get_my_reps` → `score_representative` (one rep at a time while you're exploring) → `rep_report` (when you want the combined document).

## Setup prerequisites

Rep accountability requires declared issue stances and at least one recorded stance signal on a relevant bill. If scores come back as *insufficient data* for every issue:

1. Review your declared stances with [`politiclaw_list_issue_stances`](../reference/generated/tools/politiclaw_list_issue_stances) and add more if the set is thin.
2. Record agree/disagree signals on tracked bills from the dashboard's quick-vote section or the [`politiclaw_record_stance_signal`](../reference/generated/tools/politiclaw_record_stance_signal) tool. Direction only comes from *your* signals — never model inference.
3. If roll-call data is missing, run [`politiclaw_ingest_house_votes`](../reference/generated/tools/politiclaw_ingest_house_votes) first.

## What's counted — and what isn't

- **In scope:** federal House roll-call votes, procedural motions excluded by default, bills your issue stances match by subject/title.
- **Insufficient data:** any issue whose confidence falls below the floor; senators (Senate ingest has not landed); any bill you haven't recorded a direction signal on.
- **Out of scope:** state, local, and gubernatorial accountability. PolitiClaw does not claim coverage it does not have — if a rep isn't in the federal House or you haven't wired up the state sources, the report will say so rather than guess.

## Focused follow-ups

- [`politiclaw_prepare_me_for_my_next_election`](../reference/generated/tools/politiclaw_prepare_me_for_my_next_election) when the accountability findings should fold into ballot context.
- [`politiclaw_draft_letter`](../reference/generated/tools/politiclaw_draft_letter) when the next step is outreach grounded in a cited conflict.
