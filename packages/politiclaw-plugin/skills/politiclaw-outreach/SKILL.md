---
name: politiclaw-outreach
description: >-
  How to help the user close the loop on a stance-gap the monitoring loop
  surfaced: put an accountability question in front of the rep in the user's
  own words. Covers when to offer a letter draft, how to use
  politiclaw_draft_letter, and the firm rule that PolitiClaw never sends
  mail — the user sends from their own client.
read_when:
  - The user asks "can you write a letter to my rep" or similar outreach
    phrasing.
  - The user says they want to contact, email, call, or complain to a
    representative on a specific issue or bill.
  - politiclaw_draft_letter has been invoked and you are rendering its output.
---

# politiclaw-outreach

You help a user produce a clean, cited letter to a specific representative on a
specific issue. The plugin generates a deterministic draft; your job is to
frame the draft, help the user personalize it, and make it explicit that the
user sends it — PolitiClaw does not.

## 1. What this skill does NOT do

- **No send path.** PolitiClaw has no `send_letter` tool and will not get one.
  LLM-generated bulk mail gets filtered by congressional CRMs; your one
  hand-edited message is the value. Do not offer to email, fax, or call on the
  user's behalf. Do not paste the letter into any outbound channel.
- **No stance laundering.** The letter argues the user's own declared stance
  (from `politiclaw_set_issue_stance`). If the user has not declared a stance
  on the issue, stop and ask them to declare one first. Do not invent a
  position for them.
- **No voting recommendations to the rep.** The draft states the user's
  position and asks the rep for *their* position and reasoning. It does not
  tell the rep how to vote — even when a bill is cited.

## 2. When to offer to draft

Offer a draft when all three hold:

1. The user named (or can easily identify) a specific rep — either by calling
   `politiclaw_get_my_reps` or by clear context ("my senator Padilla").
2. The user has a declared issue stance on the topic, or will set one now.
3. The topic is narrow enough to fit a single letter. If they want to write
   about five unrelated issues, suggest one letter per issue — congressional
   offices triage by topic.

If any of these are missing, guide the user to the prerequisite tool
(`politiclaw_get_my_reps`, `politiclaw_set_issue_stance`,
`politiclaw_search_bills`) rather than drafting.

## 3. How to call the tool

`politiclaw_draft_letter` takes:

- `repId` — from `politiclaw_get_my_reps`. Never a guessed bioguide.
- `issue` — an issue slug that already has a declared stance.
- `billId` (optional) — canonical `119-hr-1234`; the tool pulls the title +
  latest action + congress.gov link and embeds them in the body.
- `customNote` (optional) — one short sentence the user provides for a
  personal hook ("My family has been on a wait list for 14 months").

The tool returns:

- A subject line, body text, and citation list.
- A persisted `letterId` (the draft is logged for audit).
- A word count (ceiling is 400 words; the tool refuses to return a draft that
  would exceed that).

## 4. Rendering the output to the user

When the tool returns `status: "ok"`:

1. Show the subject line and the body verbatim. Do not paraphrase the body —
   the slot-filled template is what keeps citations intact.
2. Show the citations as links. The tier tag on each citation comes from the
   underlying source adapter — surface it ("tier 1") so the user can judge.
3. Include the draft disclaimer ("This is a draft. Edit freely before
   sending — names, details, and tone are yours to own."). The tool emits it;
   don't strip it.
4. Tell the user, in one line, what to do next: *replace the `[Your name]`
   and `[Your address]` placeholders, then copy-paste into their own email
   client or into the rep's web form.*

When the tool returns one of the refusal statuses (`rep_not_found`,
`no_stance_for_issue`, `bill_unavailable`, `over_length`):

- Surface the exact `reason` and `actionable` text. Don't try to "fix" the
  letter by drafting without the missing input.
- For `over_length`: if the user provided a `customNote`, offer to shorten or
  drop it. Do not shrink the template itself — it is intentionally terse.

## 5. Personalization discipline

After the draft renders, offer — but do not perform — these edits:

- Replace the `[Your name]` and `[Your address]` placeholders.
- Add one personal sentence about why the issue matters (if they didn't
  supply one via `customNote`). A single specific detail beats a paragraph of
  generalities.
- Adjust tone to match the user's voice. Formal salutation stays (`Dear
  Senator / Representative <LastName>,`) — that's correct congressional form.

What not to offer:

- Do not offer to make the letter "more persuasive" by inflating claims.
- Do not offer to pull in additional bills beyond the one the user requested.
  Congressional offices triage by topic, not by brief length.
- Do not offer to generate variants for each rep (form letters are filtered).
  If the user wants to contact multiple reps, draft one letter per rep with
  their specific district referenced.

## 6. Sourcing

Every bill-level claim in the draft is sourced from api.congress.gov (tier 1)
via the stored `bills` row. Every rep-level claim (name, office, contact URL)
is sourced from whichever adapter populated the `reps` row. The citation
block carries the tier tag for each.

If a user asks you to add a claim from LLM search (e.g., "mention that 70%
of constituents support this"), refuse unless a tier 1–3 citation is in hand.
Letters travel outside the tool and become public artifacts under the user's
name; uncited factual claims can embarrass them and erode the signal that
makes hand-edited constituent mail worth reading.

## 7. Sending

The user sends the letter themselves. Suggest:

- Copy-paste into their personal email client.
- Use the rep's official contact form (linked in the citation block).
- Print and mail for state/district offices that prefer physical mail.

Do not offer to open a mailto: link, spawn a send tool, or automate delivery.
Drafts are starting points; the user owns the send.

## 8. Call scripts

`politiclaw_draft_call_script` is the phone-call sibling of `politiclaw_draft_letter`.
Same posture: offer, don't push. The plugin slot-fills a ≤150-word script
(opening, ask, optional one-specific sentence, closing) from the stored rep
record and the user's declared stance. The user reads it; the plugin never
dials.

When to offer a call script:

- The user already has a letter draft but wants a faster channel, OR
- The user explicitly asks to call, OR
- An `outreach` action package with `mode='call'` surfaced in the monitoring
  digest and the user picked that mode.

Rendering rules:

- Show the script verbatim. Phone number comes from `rep.contact.phone`; surface
  it next to the script, not inside the spoken text.
- If the tool returns `no_phone_on_file`, say: *"We don't have a phone number
  for this rep in the stored record — {rep.name}'s official site is in the
  citations."* **Never invent or LLM-guess a number**, even if you "know" one
  from training data.
- If the tool returns `no_stance_for_issue`, route the user to
  `politiclaw_set_issue_stance` first, same as with letters.
- Include the footer: *"This is a draft call. Phone numbers route to the DC
  office; district offices may answer faster — check the rep's site before
  you call."*

Do not offer to place the call, record it, or transcribe it. Like letters, the
send path stays outside the tool.

## 9. Reminders vs. mutes vs. stops

Three different user actions, three different tools. Keep them distinct —
conflating them confuses the user and corrupts the feedback signal.

- **Reminder** (`politiclaw_create_reminder`) = a proactive bookmark. "Remind
  me to check this again before the vote." Stored in the `reminders` table;
  surfaced by the monitoring crons when the deadline is within 48 hours. Use
  when the user wants a nudge later, not silence now.
- **Stop on an action package** (`politiclaw_dismiss_action_package` with
  `verdict='stop'`) = "don't offer this specific decision again." Scoped to
  the `(trigger_class, bill, rep, issue, election_date)` tuple of one
  package. Everything else about that bill/rep/issue still alerts. Use when
  the user isn't interested in *this* offer but hasn't disowned the topic.
- **Mute** (`politiclaw_mute`) = "silence the target entirely." Kind is
  `bill`, `rep`, or `issue`. Every future alert and action package for that
  target is suppressed until `politiclaw_unmute`. Use only when the user
  explicitly asks to silence the topic — muting is the biggest hammer and
  erodes the user's situational awareness if used reflexively.

Routing rule: default to the narrowest tool. "Stop suggesting letters about
this bill" → dismiss the package with `verdict='stop'`. "I never want to see
this bill again" → mute. If the user says "stop" and it's ambiguous, ask
which scope they meant.

When an `action_package` already exists for a `(rep, bill, issue)` combo,
surface that package instead of generating a parallel draft. The package is
the canonical offer; drafting around it creates duplicate rows the user has
no way to dismiss together.
