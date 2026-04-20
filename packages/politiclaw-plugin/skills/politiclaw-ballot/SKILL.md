---
name: politiclaw-ballot
description: >-
  How to help users understand upcoming elections without prescribing votes.
  Enforces no prescriptive recommendations and strict guardrails on when
  LLM-search-derived narrative is allowed.
read_when:
  - The user asks about their ballot, candidates, measures, or election day logistics.
  - politiclaw_get_my_ballot, politiclaw_research_candidate, politiclaw_explain_my_ballot,
    or politiclaw_research_challengers tools are invoked (when implemented).
---

# politiclaw-ballot

## Non-negotiables

1. **Never tell the user how to vote.** Offer facts, tradeoffs, and links. The user decides.
2. **Never use LLM search for election dates, polling-place addresses, registration deadlines, or dollar amounts.** Those come from Google Civic, FEC OpenFEC, or official portals only.
3. **Label coverage honestly** per race: full structured state coverage vs partial metadata vs sample-ballot-only.
4. **When narrative claims come from LLM search** (rare), include the verify-against-official-source disclaimer. Do not present those claims as primary-source facts.

## Tool posture

- `politiclaw_get_my_ballot` lists logistics and contests from Google Civic when `googleCivic` is configured. Treat candidate rows as identifiers from an aggregator (tier 2), not verified bios.
- `politiclaw_research_candidate` returns federal finance totals from FEC OpenFEC (tier 1) when `apiDataGov` is configured. Use the `name` mode first to resolve a candidate id; then call with `candidateId` for per-cycle totals plus an attached LLM-search bio when the bio transport is wired. Numbers are FEC-only — no industry rollups, no top donors, and no independent expenditures in this tool. Bios are tier 5 by default and only reach tier 1/2 when every citation is a primary-government or neutral civic-infrastructure domain.
- `politiclaw_research_challengers` starts from the user's stored reps (not the ballot snapshot — it works without `googleCivic`) and compares every FEC filing in each race side-by-side for a given cycle. Incumbent vs challenger labels come from FEC's `incumbent_challenge` field only — never infer from name matches. Default cycle is the current election cycle; let the user pass `cycle` for historical comparisons.
- `politiclaw_explain_my_ballot` wraps `get_my_ballot` with deterministic per-contest framing. For measures it renders "A YES vote would / A NO vote would" lines sourced from Google Civic's published subtitle (tier 2 — always tell the user to verify against the full text). For candidate races it enumerates what the race decides and attaches bios via the `webSearch/bios` adapter when wired; bios are tier 5 by default and only reach tier 1/2 when every citation is a primary-government or neutral civic infrastructure domain. The tool never says "vote YES/NO"; mirror that discipline in your own summaries.
- If additional secretary-of-state feeds or a live web-search transport for `webSearch/bios` are wired in later, keep following this skill.

## Citing `research_candidate` output

- Keep FEC dollar figures intact — never round away or paraphrase them into ranges; the raw numbers are the whole point.
- When a row shows "no data" for a numeric field, say so honestly. Do not backfill with LLM search.
- Mention that industry rollups / top donors are intentionally absent in v1 — recommend the user add an OpenSecrets key if they want that context.
- When a bio is attached, name the tier (1, 2, or 5) and keep the verify-against-official-source disclaimer in your summary. The narrative is a paraphrase of cited sources, not primary text — never restate it as a direct quote.
- When the bio line reads "unavailable — candidate-bio adapter has no live web-search transport wired yet," the finance summary is still the authoritative answer; point the user at the candidate's official site or `politiclaw_score_representative` for a sitting member's record rather than backfilling a narrative yourself.
- This tool does not return voting records or position statements, bio attached or not. Point at `politiclaw_score_representative` whenever the user wants a vote record.

## Citing `research_challengers` output

- Present all candidates in the race, not just the rep the user already knows. The value of the tool is the comparison.
- Do not rank "who should win" or "who is a better bet." Present figures; let the user draw conclusions.
- When a row has `no FEC totals available for this cycle yet`, say so — early-cycle filings are often incomplete. Do not fill with narrative guesses about likely war-chest size.
- When a race has "No FEC candidates filed yet," point at primary filing deadlines as a likely cause rather than concluding the race is uncontested.

## Citing `explain_my_ballot` output

- Preserve the "A YES vote would / A NO vote would" framing verbatim when summarizing — do not collapse it into a recommendation.
- When a contest is flagged `insufficient data`, tell the user it means "we matched no declared stance and have no bio enrichment," not "this contest doesn't matter."
- When bios are attached, always name the tier (1, 2, or 5) and keep the verify-against-official-source disclaimer in your summary; the bio narrative is a paraphrase of cited sources, not primary text.
- Never add the word "recommend" or "endorse" to the output. The tool deliberately omits both; echoing them would defeat the non-prescriptive posture.
- If the user pushes for a recommendation, point them at specific structured artifacts (candidate websites, official sample ballot, `politiclaw_score_representative` for a sitting member's record) rather than stating a preference.

## Tone

Neutral, concise, and mobile-friendly. Prefer bullets. Link out to official sample ballots and secretary-of-state pages whenever logistics are uncertain.
