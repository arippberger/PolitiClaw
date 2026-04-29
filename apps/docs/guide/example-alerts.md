# Examples of Good Alerts

This page shows the *shape* of PolitiClaw's proactive output: what a well-formed rep-vote hit looks like, what silence looks like, what a weekly digest looks like.

## About these examples

These examples are **illustrative, not generated**. The durable contracts live in:

- [Generated Cron Jobs](../reference/generated/cron-jobs) — exact schedules and payloads
- [Generated Skills](../reference/generated/skills) — the enforced alert-shape rules
- The skill markdown itself, read by the agent each time a cron fires

If an example here reads like a fictionalized version of the current output, that's the point: it's calibrated to the skill contract, not copy-pasted from a real run. Trust the skill files when the two drift.

## A rep-vote watch hit

Emitted by `politiclaw.rep_vote_watch` when a bill on one of your tracked issues shows `[new]` or `[changed]` and crosses the confidence floor.

> **HR-1234 — Affordable Housing Accelerator Act** `[new]`
>
> Introduced 2026-04-18. Latest action: referred to House Financial Services.
>
> Direction: *appears to advance* your `support` stance on `affordable-housing`. The bill text grants HUD authority to "waive local single-family-only zoning requirements where a state has declared a housing emergency" — which matches your stated preference for zoning-waiver expansion.
>
> Counter-consideration from the tool: the same section preempts local zoning authority, which some civic groups argue undercuts neighborhood input.
>
> Source: api.congress.gov (tier 1).
>
> *This alignment is a recorded claim, not a vote recommendation. Verify against the linked bill text before deciding.*

What to notice:

- The `[new]` tag came from the plugin's change detection, not the agent.
- The direction is quoted from the bill's own text. A bill with no quotable directional signal renders as `direction unclear` instead.
- The alignment disclaimer is present verbatim; the skill forbids stripping it.

## A quiet-window silent-ok

Emitted by any monitoring job when the delta is empty.

> No new or materially changed items since last check (checked 14 bills, 3 upcoming events).

That's the whole message. No padding, no "here's what's still on the watch list," no "stay tuned." The monitoring skill is explicit: empty deltas get one brief confirmation line, never a padded digest.

## A weekly summary

Emitted by `politiclaw.weekly_summary` on the 7-day cadence. Target length is 250–400 words, enforced by the summary skill.

> **Headline.** Quiet week on federal climate bills; one committee markup moved on your `oppose` stance on `wetlands-rollback`.
>
> **Bills touching your declared stances.**
>
> - **HR-2211 — Wetlands Regulatory Clarity Act** · status: reported favorably from House Natural Resources, 23–19 · aligns against your `oppose` on `wetlands-rollback` (tier 1, api.congress.gov)
> - **S. 845 — Clean Energy Manufacturing Tax Credit Extension** · status: introduced · aligns with your `support` on `clean-energy` (tier 1, api.congress.gov)
>
> **Upcoming (next 7 days).**
>
> - House Natural Resources markup on HR-2211 — 2026-04-29, 10:00 ET
> - House Ways and Means hearing on clean-energy credits — 2026-04-30, 14:00 ET
>
> **Things you might be surprised by.**
>
> HR-2211's committee report cites testimony from two wetlands scientists you would likely agree with arguing the bill's permit-streamlining language could be narrowed without gutting the underlying protections. Worth reading their framing before assuming the bill is purely rollback (source: House Natural Resources committee report, tier 1).
>
> **What PolitiClaw missed.**
>
> No source issues this week.
>
> *This summary is informational, not independent journalism. Verify against neutral sources before voting or contacting officials.*

What to notice:

- The "things you might be surprised by" section is mandatory on any week with bill movement. If the week's delta is genuinely one-directional, the skill says so explicitly rather than fabricating opposition.
- Every numerical claim carries a source tier.
- The disclaimer is the exact verbatim line the skill requires.

## An election-proximity ping

Emitted by `politiclaw.election_proximity_alert` only at 30, 14, 7, and 1 day before an election on your saved ballot.

> Election in **14 days** at *1234 Civic Center Dr, Springfield*. Run `politiclaw_election_brief` for a full guide.

One line. Other days produce nothing.

## A rep report excerpt

Emitted by `politiclaw.rep_report` on the 30-day cadence. The full digest covers every stored rep; this is the shape of a single entry.

> **Rep. Jane Doe (CA-12)**
>
> Recorded-vote alignment on your declared stances: 7 of 9 counted votes align; 2 against on tracked issues.
>
> - Aligned: voted YES on HR-1234 (affordable-housing waivers; tier 1, api.congress.gov)
> - Against: voted YES on HR-2211 (wetlands rollback; your `oppose` stance)
>
> Blind spots: 3 bills matched your stances but had no stance signal because they did not reach a recorded roll call.
>
> *This alignment is a recorded claim, not a vote recommendation. Verify against the linked bill text before deciding.*

What to notice:

- The counted-votes denominator is explicit ("7 of 9 counted votes") — the skill forbids presenting partial coverage as a complete record.
- Blind spots are named inline, not buried in a footer.
- Links resolve to `congress.gov` tier-1 primary sources.

## What a bad alert looks like (and why PolitiClaw won't produce one)

Three counter-examples the skills explicitly prevent:

### A fabricated dissenting view

> **Things you might be surprised by.** Critics of HR-1234 argue it could raise housing costs in suburban markets.

Missing: named source, tier tag, quotable basis. The monitoring skill requires the dissenting item to be tier 1–3 with a source link, and forbids LLM-authored counterpoints. If no real dissenting item exists in the delta, the skill says so explicitly.

### An LLM-search vote tally

> Rep. Doe has voted against wetlands protection 62% of the time this session.

Percentages without a tier-1 vote ledger are a tier-5 fabrication. The skill is explicit: no numerical claim gets attributed to LLM search. If the recorded-vote set doesn't support a number, the correct output is "number not verifiable from deterministic sources."

### A padded empty week

> **Headline.** A quiet but interesting week, with lots happening behind the scenes on your tracked issues...

Padding empty deltas trains the user to stop reading. The skill requires a single quiet-week line instead. Brevity is a trust mechanism, not a missing feature.

## In the accountability loop

This page is the "what alerts look like" side of the loop. The rest:

- [How PolitiClaw Holds Representatives Accountable](./rep-accountability) — the full loop with the diagram, the dissenting-view rule, and source-tier discipline.
- [See How My Reps Align](./see-how-my-reps-align) — the operational entry point that scoring drives.
- [Track Bills and Votes](./track-bills-and-votes) — the evidence side that monitoring jobs read from.
