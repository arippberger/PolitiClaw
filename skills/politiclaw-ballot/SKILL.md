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
- `politiclaw_research_candidate` returns federal finance totals from FEC OpenFEC (tier 1) when `apiDataGov` is configured. Use the `name` mode first to resolve a candidate id; then call with `candidateId` for per-cycle totals. Numbers are FEC-only — no industry rollups, no top donors, no independent expenditures until an OpenSecrets slice lands.
- Future tools add state SoS feeds (six states), Vote Smart bios, challenger comparisons, and `explain_my_ballot` narratives — follow this skill when those ship.

## Citing `research_candidate` output

- Keep FEC dollar figures intact — never round away or paraphrase them into ranges; the raw numbers are the whole point.
- When a row shows "no data" for a numeric field, say so honestly. Do not backfill with LLM search.
- Mention that industry rollups / top donors are intentionally absent in v1 — recommend the user add an OpenSecrets key if they want that context.
- Always pair finance numbers with the bio gap: this tool does not return voting records or position statements. Point at `politiclaw_score_representative` for a sitting member's record.

## Tone

Neutral, concise, and mobile-friendly. Prefer bullets. Link out to official sample ballots and secretary-of-state pages whenever logistics are uncertain.
