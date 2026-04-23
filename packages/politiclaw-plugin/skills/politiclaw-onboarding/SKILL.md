---
name: politiclaw-onboarding
description: >-
  How to run the initial issue-stance setup with a new PolitiClaw user.
  Offers two modes — a guided conversation and a structured quiz — and
  persists results through politiclaw_set_issue_stance. These declared
  stances are the baseline PolitiClaw uses to score representative
  accountability; no score exists without them.
read_when:
  - The user asks to "set up PolitiClaw", "get started", or "help me pick my issues".
  - The politiclaw_configure tool is invoked and returns an issue-setup handoff.
  - A user with zero declared issue stances asks anything that would require them.
---

# politiclaw-onboarding

The goal is to end the session with a populated `issue_stances` set that
feels like the user's own words, not a survey they filled out. These
stances become the accountability anchor — every rep score later in the
product is measured against them, and nothing else. Two modes are
supported; the user picks.

## Entry protocol

1. Call `politiclaw_configure` (no `mode` argument).
2. Present the two choices to the user in your own words. Do not bias —
   neither mode is "better", they suit different users.
3. Re-invoke `politiclaw_configure` with the chosen `mode`. The
   tool returns everything you need to run that mode plus any stances the
   user has already declared.

If the user already has stances and asks to "redo" onboarding, ask
whether they want to keep, revise, or wipe each existing one before
persisting anything new.

## Conversation mode

The tool returns a list of suggested opening prompts and the canonical
issue-slug set. Use them like this:

1. **Open with one question, not a menu.** Pick one of the suggested
   prompts that fits the moment. Ask it plainly. Do not list the
   canonical slugs upfront — you'll match later.
2. **Let the user speak in their own words.** They will say "I care
   about healthcare costs," "guns scare me," "I'm furious about rent."
   Accept all of that as-is.
3. **Paraphrase every stance back before persisting.** Format:
   "Sounds like you support stronger gun-policy restrictions, and it
   matters a lot to you — want me to record that as `support` on
   `gun-policy` with weight 4 out of 5?" Wait for confirmation.
4. **Map free text to a canonical slug when possible.** If the user
   names an issue that doesn't match the canonical set, flag it: "That's
   not one of the canonical issues PolitiClaw scores — I can still save
   it as a custom slug, but automated bill matching may be weaker." Then
   let them decide.
5. **Persist via `politiclaw_set_issue_stance`.** Pass the normalized
   slug, the confirmed stance (`support` / `oppose` / `neutral`), and
   the weight. Do not batch persists silently — confirm each.
6. **Stop when the user runs out of things to say.** Three solid stances
   are better than twelve half-considered ones.

Anti-patterns to avoid:

- Don't ask all suggested prompts in sequence — you'll sound like a form.
- Don't argue with or "correct" a stance you disagree with. Record what
  the user said.
- Don't persist a stance without confirming the slug and weight back.

## Quiz mode

The tool returns the question bank (~12 items) with canonical slugs and
suggested labels. Rules:

1. **Ask sequentially, one at a time.** Never paste the full list.
2. **Present exactly three answer labels** (the ones the tool returned).
   The user can free-text, but keep the options visible.
3. **Skip the weight follow-up on "no strong view."** Only ask "how
   important is this?" after `support` or `oppose`.
4. **"No strong view" is silence, not `neutral`.** Do not persist an
   `IssueStance` row for questions the user declined unless they
   explicitly say "yes, record it as neutral."
5. **Read back the full list before committing.** "Here's what I'll save:
   [list]. Commit all of these?"
6. **Commit via `politiclaw_set_issue_stance`** once the user
   confirms.

## Returning users

The tool passes `existingStances`. In either mode:

- Skip questions the user already answered, unless they say "I want to
  revise that."
- Never silently overwrite an existing stance. Confirm first.
- If the user has stances on issues outside the canonical set, leave
  them alone.

## Tone

Plain, warm, non-leading. No "fascinating!" / "great question!" filler.
This is a setup step, not a quiz show.
