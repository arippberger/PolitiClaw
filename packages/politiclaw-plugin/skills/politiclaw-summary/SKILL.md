---
name: politiclaw-summary
description: >-
  Weekly PolitiClaw digest style: what the user's reps did this week against
  the stances they declared. One message, readable in ~60 seconds, facts not
  cheerleading, built on the tool's tier-1/tier-2/tail bundling and a mandatory
  "things you might be surprised by" section.
read_when:
  - The weekly_summary cron template fires.
  - The user explicitly asks for a weekly roll-up of PolitiClaw activity.
---

# politiclaw-summary

The weekly digest is one message, not a thread. Target length: 250–400
words. Longer only if the week was genuinely eventful.

## Required sections, in this order

### 1. Headline — one sentence

What changed this week that matters most to the user. When any counted
rep vote crossed the confidence floor this week, lead the headline with
how the user's top-weight issue was represented (e.g. "Your highest-
weight issue, climate, saw 2 aligned and 1 conflicted rep votes this
week."). If nothing moved, say that plainly: "Quiet week. No bills
touching your declared stances moved."

### 2. Bills touching your declared stances

Use the tool's tier grouping. Do not re-sort. See `politiclaw-monitoring`
§2 Class A for the full shape.

- **Interruptive (tier 1, up to 3 items)**: full Class-A render — headline,
  why it matters (with quoted bill text when the tool surfaced one),
  counter-consideration if present, and a Next line unless the action is
  past.
- **Digest (tier 2, up to 5 items)**: one-line Class-A digest render. No
  Next step in the digest body.
- **Tail**: the tool's single "Also changed: N bills — {topic counts}" line.
  Never silently truncate; keep the count so the user can ask for the full
  list.

Example tier-2 digest line:

> - **HR-1234 — Clean Housing Investment Act of 2026** referred to
>   committee · touches your `support` on `affordable-housing`.

If `alignment.belowConfidenceFloor` is true, the tool has already routed the
item to the tail — do not lift it into the digest or quote raw percentages.

### 3. Upcoming (next 10 days)

Committee hearings, markups, or floor votes on tracked bills. Class B format
(see `politiclaw-monitoring` §2). If nothing's scheduled, say "Nothing
scheduled in the tracked set."

### 4. Rep misalignments surfaced this week (when applicable)

Summarize any Class C items that `rep_vote_watch` posted immediately during
the week, plus any aligned-vote counts. Example:

> - Rep. Smith (D-CA-12) had 2 misaligned votes flagged this week (HR-1234,
>   HR-5678). Aligned with your stances on 3 of 5 counted votes.

If no misalignments fired, skip this section — do not pad.

### 5. Things you might be surprised by (required)

This section is **not optional on weeks with any bill movement**. It contains
at least one item that complicates or cuts against the user's declared
stances. The tool's `counterConsideration` output is the first-choice
source; external examples:

- A bill in an area the user marked `support` that the sponsoring committee
  staff argue would harm rather than help that stance.
- A rep the user generally aligns with voting against the user's stated
  preference on a specific bill this week.
- A widely-reported piece of context from a tier 2–3 source that reframes a
  tracked issue.

Rules:

- Source must be tier 1–3 (primary government, neutral civic, reputable
  journalism). Advocacy (tier 4) is allowed *only* with explicit labeling.
- **Never fabricate.** If the week's delta is genuinely one-directional, say
  so: "Nothing in this week's delta cuts against your declared stances —
  worth flagging so you know this digest isn't curating for agreement."
- **Never use tier-5 LLM-search output for numbers, vote counts, or status
  claims.**

### 5. Your move (only if accountability is `nudge_me` or `draft_for_me`)

Check the user's `accountability` mode (read it from
`politiclaw_doctor` output or the cached preferences if you have them).

- `self_serve` (default): **omit this section entirely.** The user opted
  out of suggested actions. Don't editorialize.
- `nudge_me`: append 1–3 concrete next steps the user could take this
  week — e.g. "Call Rep. Garcia (D-CA-13) about HR-1234 before Tuesday's
  markup", "Check your registration; primary is in 21 days." Do not
  draft anything yourself; just suggest.
- `draft_for_me`: same as `nudge_me`, plus call
  `politiclaw_draft_letter` proactively for the single highest-alignment
  bill from section 2 and surface "Drafted a letter for Rep. X — review
  and send via `politiclaw_send_letter`." Cap at one auto-draft per
  digest to avoid swamping the user.

Each suggestion is one sentence. Do not pad. If the week is quiet enough
that there's nothing concrete to suggest, omit the section even in
`nudge_me`/`draft_for_me`.

### 6. What PolitiClaw missed

One line naming any source that returned `unavailable` or `partial` this
week, with the actionable fix. Examples:

- "Missed: FEC campaign-finance updates (configure `apiKeys.apiDataGov` to
  light up)."
- "Missed: state bills (optional `apiKeys.openStates` or `apiKeys.legiscan`
  not set)."

If everything ran clean, skip this section.

### 7. Disclaimer

Verbatim, at the bottom:

> This summary is informational, not independent journalism. Verify against
> neutral sources before voting or contacting officials.

## Style rules

- **No cheerleading.** "Big win for climate!" is editorializing. "HR-1234
  passed committee 12-9" is a fact.
- **No prescriptive language.** Not "you should oppose X"; "a YES on X would
  do Z; your declared `oppose` on that area would conflict."
- **Every numerical claim carries a source tier.** If you can't source it
  tier 1–2, say so.
- **Every item links to the primary source** (api.congress.gov/bill/... or
  the appropriate SoS URL). Make the user's verification path one click.
- **Plain text, not marketing formatting.** Phones render bullets and bold
  fine; emojis, headers-with-divider-bars, and multi-column layouts render
  ugly.

## When to send nothing

If the weekly roll-up truly has no content — empty delta all week, no
upcoming events, no source problems — send one line:

> "Quiet week. Nothing in your tracked set moved. (Baseline still live; will
> re-alert on the next material change.)"

Padding a quiet week with filler trains the user to stop reading the digest.
Brevity protects trust.
