---
name: politiclaw-onboarding
description: >-
  How to drive `politiclaw_configure` end-to-end — a single staged tool that
  walks the user through address → top issues → monitoring mode →
  accountability → final monitoring contract. The tool re-derives the
  current stage from DB state on every call; you just relay the prompt and
  collect the next answer.
read_when:
  - The user asks to "set up PolitiClaw", "get started", or "change my settings".
  - The user asks "what is PolitiClaw doing for me?" / "what are you watching?".
  - A user with no preferences asks anything that would require them.
  - You see a `politiclaw_configure` response with a `nextPrompt` field.
---

# politiclaw-onboarding

`politiclaw_configure` is a one-tool front door. Each call returns:

```
{ stage, nextPrompt, savedThisCall, monitoringContract? }
```

You call it, read `nextPrompt`, ask the user, then call again with their
answer plus the same `stage` you were told to advance to. When `stage`
becomes `complete`, render the `monitoringContract` block to the user.

## The five stages

| Stage | What you collect from the user |
|---|---|
| `address` | Street address (and optionally zip / state / district). |
| `issues` | Either inline `issueStances[]`, or pick a mode: conversation / quiz. |
| `monitoring` | Monitoring mode: `off` / `quiet_watch` / `weekly_digest` / `action_only` / `full_copilot`. |
| `accountability` | Accountability mode: `self_serve` / `nudge_me` / `draft_for_me`. |
| `complete` | Nothing — just render the contract. |

The goal is to end the session with a populated `issue_stances` set that
feels like the user's own words, not a survey they filled out. These
stances become the accountability anchor — every rep score later in the
product is measured against them, and nothing else.

The stage cursor is derived from DB state, not from you. If a user
changes their mind mid-flow ("actually, set me back to quiet_watch") just
call again with the new value — the tool will accept it.

## Entry protocol

1. Call `politiclaw_configure` with no arguments.
2. The tool returns `{ stage, nextPrompt, ... }`. Read `nextPrompt`
   verbatim is acceptable, but rephrase in your own voice if it fits.
3. Ask the user. Wait for the answer.
4. Call `politiclaw_configure` again with `{ stage, <field>: <answer> }`.
5. Loop until `stage === "complete"`.

You may pass multiple stages' answers in one call if the user volunteered
them ("I'm at 123 Main St, weekly_digest, nudge me"). The tool will save
all of it and advance the cursor to the earliest unfilled gate.

## The `issues` stage

If the user has zero stances, the tool returns a payload offering two
modes — conversation or quiz. Present both options briefly; do not bias.

### Conversation mode

The tool returns suggested opening prompts and the canonical issue-slug
set.

1. Open with one question, not a menu. Pick one suggested prompt that
   fits the moment.
2. Let the user speak in their own words. Accept "healthcare costs",
   "guns scare me", "I'm furious about rent" as-is.
3. Paraphrase every stance back before persisting:
   "Sounds like you support stronger gun-policy restrictions, and it
   matters a lot — record that as `support` on `gun-policy`, weight 4
   out of 5?"
4. Map free text to a canonical slug when possible. If it doesn't fit,
   flag it: "That's not one of PolitiClaw's canonical issues — I can
   save it as a custom slug, but automated bill matching may be weaker."
5. Persist by calling `politiclaw_configure` with `{ stage: "issues",
   issueStances: [{ issue, stance, weight }] }`. One stance at a time
   is fine; the tool will keep returning `stage: "issues"` until the
   user says they're done.
6. Stop when the user runs out — three solid stances beat twelve
   half-considered ones.

### Quiz mode

The tool returns the question bank (~12 items) with canonical slugs and
suggested labels.

1. Ask sequentially, one at a time. Never paste the full list.
2. Present exactly three answer labels per question.
3. Skip the weight follow-up on "no strong view." Only ask "how
   important is this?" after `support` or `oppose`.
4. "No strong view" is silence, not `neutral`. Do not persist a row for
   declined questions unless the user explicitly says "yes, record it
   as neutral."
5. Read back the full list before committing.
6. Commit by calling `politiclaw_configure` with the full
   `issueStances[]` array.

## The `monitoring` stage

The tool returns plain-English explainers for each mode. Read them to
the user, ask which fits, then call again with `monitoringMode: <choice>`.
Five options, product-shaped:

- `off` — no automated alerts.
- `quiet_watch` — silent unless tracked bills or hearings materially change.
- `weekly_digest` — Sunday summary plus monthly rep report, plus change
  detection.
- `action_only` — quiet, with election-proximity alerts layered on.
- `full_copilot` — everything.

## The `accountability` stage

Three modes, each with concrete consequences:

- `self_serve` — facts only. Status quo. Default.
- `nudge_me` — appends a "Your move" section with 1–3 suggested actions.
- `draft_for_me` — same as `nudge_me`, plus auto-drafts letters when a
  tracked bill crosses the alignment threshold.

Read the explainer the tool returns, ask, save with
`accountability: <choice>`.

## The `complete` stage

The tool returns a `monitoringContract`. Render it as one block:

- Address (resolved or not)
- Top stances by weight
- "Monitoring mode: weekly_digest — Sunday summary plus monthly rep report."
- "Accountability: nudge me — I'll add a 'Your move' section."
- "Watching:" — list active jobs with what each one watches for.
- "Not watching:" — list inactive jobs with the reason
  (`missing_api_key`, `no_address`, `mode_excludes`, etc.) so the
  user knows the gap is named, not silently ignored.
- Caveats — single delivery channel, federal reps only, etc.
- "To change: …" — the `changeHowTo` line.

Do not omit the inactive jobs or caveats. Surfacing limitations honestly
is the whole point of the contract block.

## Returning users

If the user already has preferences, stances, monitoring mode, and
accountability set, calling `politiclaw_configure` with no args returns
`stage: "complete"` and the current contract — no prompts. Just render.

If the user says "change my X", call with `{ stage: "<X>", <field>:
<value> }` directly. You don't have to walk them through the earlier
stages again.

## Anti-patterns

- Don't call lower-level tools (`politiclaw_set_issue_stance`,
  `politiclaw_set_monitoring_mode`) for first-time setup. Use
  `politiclaw_configure`.
- Don't omit inactive jobs or caveats from the contract block.
- Don't argue with a stance you disagree with. Record what the user said.
- Don't persist a stance without confirming the slug and weight back.

## Tone

Plain, warm, non-leading. No "fascinating!" / "great question!" filler.
This is a setup step, not a quiz show.
