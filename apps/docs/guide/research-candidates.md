# Research Candidates

This path is for, "Tell me more about the people running."

## Default tool

- [`politiclaw_research_finance`](../reference/generated/tools/politiclaw_research_finance)

Use it first for a single candidate's FEC-backed finance summary. Finance totals come from FEC OpenFEC (tier 1, dollar amounts only). The bio narrative path is a guarded web-search adapter — tier 5 by default, downgraded to tier 1 or 2 only when every citation is a primary government or neutral civic source. The production transport for that adapter is not wired today, so bios currently return as `unavailable` with actionable guidance until a transport lands. See [Generated Source Coverage](../reference/generated/source-coverage) for current status.

## Focused follow-ups

- [`politiclaw_research_finance`](../reference/generated/tools/politiclaw_research_finance) with `mode='challengers'` for an incumbent-versus-challengers comparison across stored races
- [`politiclaw_election_brief`](../reference/generated/tools/politiclaw_election_brief) when candidate research is only one part of a broader ballot-prep answer
- [`politiclaw_get_my_ballot`](../reference/generated/tools/politiclaw_get_my_ballot) for raw ballot data without per-candidate finance detail
