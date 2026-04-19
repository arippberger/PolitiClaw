---
name: politiclaw-ballot
description: >-
  How to help users understand upcoming elections without prescribing votes.
  Uses docs/risks.md section 1 (no prescriptive recommendations) and section 9
  (LLM-search guardrails for ballot-adjacent narrative).
read_when:
  - The user asks about their ballot, candidates, measures, or election day logistics.
  - politiclaw_get_my_ballot, politiclaw_research_candidate, politiclaw_explain_my_ballot,
    or politiclaw_research_challengers tools are invoked (when implemented).
---

# politiclaw-ballot

## Non-negotiables

1. **Never tell the user how to vote.** Offer facts, tradeoffs, and links. The user decides.
2. **Never use LLM search for election dates, polling-place addresses, registration deadlines, or dollar amounts.** Those come from Google Civic, FEC OpenFEC, or official portals only (docs/risks.md section 9).
3. **Label coverage honestly** per race: full structured state coverage vs partial metadata vs sample-ballot-only.
4. **When numerical claims come from LLM search** (rare; narrative only), include the verify-against-official-source disclaimer from docs/risks.md section 9.

## Tool posture (Phase 6 rollout)

- `politiclaw_get_my_ballot` lists logistics and contests from Google Civic when `googleCivic` is configured. Treat candidate rows as identifiers from an aggregator (tier 2), not verified bios.
- Future tools add FEC finance, state SoS feeds (six states), Vote Smart bios, and `explain_my_ballot` narratives — follow this skill when those ship.

## Tone

Neutral, concise, and mobile-friendly. Prefer bullets. Link out to official sample ballots and secretary-of-state pages whenever logistics are uncertain.
