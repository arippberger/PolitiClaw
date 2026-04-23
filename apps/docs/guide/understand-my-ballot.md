# Understand My Ballot

This is the best path when the user's goal is, "Help me make sense of the next election."

Ballots come from Google Civic with generic contest shape — judicial and ballot-measure enrichment is not wired. See [current coverage](../reference/source-coverage#what-is-not-covered-today).

## Default tool

- [`politiclaw_prepare_me_for_my_next_election`](../reference/generated/tools/politiclaw_prepare_me_for_my_next_election)

Use it first because it checks setup, pulls ballot context, and returns one readable guide instead of forcing the user to assemble the answer from separate tools.

## Focused follow-ups

- [`politiclaw_explain_my_ballot`](../reference/generated/tools/politiclaw_explain_my_ballot) for a tighter contest-by-contest framing
- [`politiclaw_research_candidate`](../reference/generated/tools/politiclaw_research_candidate) for a deeper look at a specific candidate
- [`politiclaw_score_representative`](../reference/generated/tools/politiclaw_score_representative) for incumbents already in office

## Setup prerequisites

Most ballot flows depend on:

- [`politiclaw_configure`](../reference/generated/tools/politiclaw_configure)
- [`politiclaw_get_my_reps`](../reference/generated/tools/politiclaw_get_my_reps)
- issue stances from [`politiclaw_configure`](../reference/generated/tools/politiclaw_configure) or [`politiclaw_set_issue_stance`](../reference/generated/tools/politiclaw_set_issue_stance)

If anything seems broken, start with [`politiclaw_doctor`](../reference/generated/tools/politiclaw_doctor).
