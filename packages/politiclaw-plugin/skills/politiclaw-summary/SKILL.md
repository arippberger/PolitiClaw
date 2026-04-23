---
name: politiclaw-summary
description: >-
  Weekly PolitiClaw digest style. One message, readable in ~60 seconds, with a
  mandatory "things you might be surprised by" section.
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

Bullet list, one line per bill. Format:

> - **HR-1234 — [title]** · status: [latest action] · aligns with your
>   `support` on `climate` (tier 1, api.congress.gov)

Cap at 5 bills. If there are more, add a "+N more, ask for the full list"
line. Never truncate silently.

If `alignment.belowConfidenceFloor` is true, drop the bill or render it as
"insufficient data" — do not quote the raw percentages.

### 3. Upcoming (next 10 days)

Committee hearings, markups, or floor votes on tracked bills. One line each.
If nothing's scheduled, say "Nothing scheduled in the tracked set."

### 4. Things you might be surprised by (required)

This section is **not optional on weeks with any bill movement**. It contains
at least one item that complicates or cuts against the user's declared
stances. Examples:

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

### 5. What PolitiClaw missed

One line naming any source that returned `unavailable` or `partial` this
week, with the actionable fix. Examples:

- "Missed: FEC campaign-finance updates (configure `apiKeys.apiDataGov` to
  light up)."
- "Missed: state bills (optional `apiKeys.openStates` or `apiKeys.legiscan`
  not set)."

If everything ran clean, skip this section.

### 6. Disclaimer

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
