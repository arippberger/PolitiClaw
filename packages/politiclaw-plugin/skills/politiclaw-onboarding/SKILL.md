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

## The six stages

| Stage | What you collect from the user | Tool enum values |
|---|---|---|
| `address` | Street address (and optionally zip / state / district). | — |
| `issues` | Either inline `issueStances[]`, or pick a mode: conversation / quiz. | — |
| `monitoring` | Monitoring mode: Paused / Quiet watch / Weekly digest / Action only / Full copilot. | `off` / `quiet_watch` / `weekly_digest` / `action_only` / `full_copilot` |
| `accountability` | Accountability mode: Self-serve / Nudge me / Draft for me. | `self_serve` / `nudge_me` / `draft_for_me` |
| `api_key` | One-time notice directing the user to `https://api.data.gov/signup/` and the host-config path for `apiDataGov`. Only appears if the key is missing. No re-prompt. | — |
| `complete` | Nothing — just render the contract. | — |

The right column is for tool-call payloads only. Always speak the human
label to the user — never the enum. If the tool's `nextPrompt` includes
an enum-cased token, translate it before reading.

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

### Stance-input shortcuts

Accept any of these as a stance answer in either mode. Always parse
client-side and pass canonical fields to `politiclaw_configure`.

| User says | Parse as |
|---|---|
| `s` / `support` / `favor` / a support-direction label from the question | `stance: "support"` |
| `o` / `oppose` / `against` / an oppose-direction label from the question | `stance: "oppose"` |
| `n` / `neutral` / `no strong view` / silence | no row persisted unless the user explicitly says "yes, record neutral" |
| `s 4`, `support 4`, `oppose, 5`, `o2`, `n` | stance + integer 1–5 weight in one line |

If the user gave stance only (no weight) on a support/oppose answer,
ask the weight follow-up as today. If they say "doesn't matter," default
to weight 3.

### Save eagerly, announce what you saved

Don't gate persistence on permission. When the user's intent is clear,
call `politiclaw_configure` immediately with the stance, weight, and any
nuance, then surface what you saved so they can correct it. Example:

> Saved: support on `gun-policy`, weight 4, note: "concerned about
> red-flag laws". Tell me if any of that's wrong and I'll update it.

If they push back, call `politiclaw_configure` again with the same
`issue` slug and the corrected fields — the upsert path handles updates.
This applies in both conversation and quiz mode.

### Conversation mode

The tool returns suggested opening prompts and the canonical issue-slug
set.

1. Open with one question, not a menu. Pick one suggested prompt that
   fits the moment.
2. Let the user speak in their own words. Accept "healthcare costs",
   "guns scare me", "I'm furious about rent" as-is.
3. When intent is clear, save first and announce — don't paraphrase-
   and-confirm before writing. Use the format above.
4. Map free text to a canonical slug when possible. The canonical set is
   mostly Library of Congress Policy Area slugs, plus narrower buckets for
   issues that need more precision. If it doesn't fit,
   flag it: "That's not one of PolitiClaw's canonical issues — I can
   save it as a custom slug, but automated bill matching may be weaker."
5. Persist by calling `politiclaw_configure` with `{ stage: "issues",
   issueStances: [{ issue, stance, weight, note, sourceText }] }`.
   Use `note` for the short specific concern inside the bucket (for
   example, "BWCA wilderness federal protections" under
   `public-lands-and-natural-resources`) and `sourceText` for the user's
   verbatim phrase. One stance at a time is fine; the tool will keep
   returning `stage: "issues"` until the user says they're done.
6. Stop when the user runs out — three solid stances beat twelve
   half-considered ones.

### Quiz mode

The tool returns the question bank (~12 items) with canonical slugs and
suggested labels.

Read this preamble once before the first question:

> I'll go one at a time. Quick shortcut: type `s` for support, `o` for
> oppose, `n` for no strong view. Add a 1–5 weight if you want, e.g.
> `s 4`.

Don't repeat the hint per question. If the first answer comes back as a
long phrase, you may append a single reminder ("by the way, `s 4` works
too"); after that, no reminders.

1. Ask sequentially, one at a time. Never paste the full list.
2. Present exactly three answer labels per question.
3. Parse the answer using the shortcuts table above. Skip the weight
   follow-up on "no strong view." Only ask "how important is this?"
   after `support` or `oppose` when the user did not include a weight.
4. "No strong view" is silence, not `neutral`. Do not persist a row for
   declined questions unless the user explicitly says "yes, record it
   as neutral."
5. Save eagerly after each answer (including any nuance) and surface
   what you saved. Read back the full list before the final commit.
6. Commit by calling `politiclaw_configure` with the full
   `issueStances[]` array, including `note` and `sourceText` when the
   user supplied nuance that should later appear in letters, call scripts,
   rep reports, or the monitoring contract.

## The `monitoring` stage

The tool returns human labels and plain-English explainers for each mode.
Read them to the user using the human label only — never the enum.

Mapping (human label → enum value to pass to the tool):

- "Paused" → `off`
- "Quiet watch" → `quiet_watch`
- "Weekly digest" → `weekly_digest`
- "Action only" → `action_only`
- "Full copilot" → `full_copilot`

Accept either form from the user (e.g. "weekly digest" or "weekly_digest")
and normalize before calling the tool. Never read the underscored form
back to the user, even if the tool's `nextPrompt` includes it.

## The `accountability` stage

Three modes, each with concrete consequences:

- **Self-serve** — facts only. Status quo. Default.
- **Nudge me** — appends a "Your move" section with 1–3 suggested actions.
- **Draft for me** — same as Nudge me, plus auto-drafts letters when a
  tracked bill crosses the alignment threshold.

Read the explainer the tool returns, ask, then save with the matching
enum value in `accountability` (`self_serve` / `nudge_me` /
`draft_for_me`). Always speak the human label to the user.

## The `api_key` stage

Only appears when the plugin config is missing `apiDataGov` and we haven't
shown the notice already. The tool returns a `signupUrl`, `configPath`, and
`configKey` along with a ready-to-read prompt. Read it verbatim or rephrase
lightly — the key points are:

1. The user signs up at `https://api.data.gov/signup/` (free, instant).
2. They paste the key back into chat. Don't ask them to edit any files.
   When they paste it, call `politiclaw_configure` again with
   `apiDataGov: "<the-key>"` — the tool persists it directly to
   `plugins.entries.politiclaw.config.apiKeys.apiDataGov` and the gateway
   restarts itself to pick it up.
3. If the user happens to mention any optional upgrade keys in the same
   message (Geocodio, Open States, OpenSecrets, etc.), pass them in
   `optionalApiKeys` on the same call so the gateway only restarts once.
4. After the restart, the user reconnects and can re-run
   `politiclaw_configure` to see the contract with the new keys live.

The user can also skip — pass no key arguments. The next `politiclaw_configure`
call will advance straight to `complete` with the federal jobs flagged
inactive. Do not loop on the `api_key` stage.

## The `api_keys_saved` stage

You see this any time the user supplies `apiDataGov` or `optionalApiKeys`.
The tool returns a `setResult` with `savedKeys`, `restartScheduled`, and
optionally `restartDelayMs`. Read the prompt verbatim or paraphrase: keys
saved, gateway restarting in ~Ns, reconnect afterwards. Do not call any
other tools in this turn — the restart will interrupt them.

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

- Don't call lower-level tools like `politiclaw_issue_stances` for
  first-time setup. Use `politiclaw_configure`.
- Don't omit inactive jobs or caveats from the contract block.
- Don't argue with a stance you disagree with. Record what the user said.
- Don't gate persistence on permission for nuance. Save eagerly when
  intent is clear and announce what you saved so the user can correct
  it.
- Don't read enum-cased tokens (`self_serve`, `nudge_me`, `quiet_watch`,
  etc.) to the user. Always translate to the human label.

## Tone

Plain, warm, non-leading. No "fascinating!" / "great question!" filler.
This is a setup step, not a quiz show.
