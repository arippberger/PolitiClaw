# Draft Outreach

This path is for, "I know what I think, now help me write to someone."

## Default tool

- [`politiclaw_draft_outreach`](../reference/generated/tools/politiclaw_draft_outreach)

It is the clearest action step after bill research, rep scoring, or ballot prep. The tool drafts only. The user still sends the message.

## Best inputs before drafting

A draft is strongest when it follows one of these:

- [`politiclaw_score_bill`](../reference/generated/tools/politiclaw_score_bill)
- [`politiclaw_score_representative`](../reference/generated/tools/politiclaw_score_representative)
- [`politiclaw_election_brief`](../reference/generated/tools/politiclaw_election_brief)

## Phone alternative

For a shorter, voice-ready script instead of a letter, use [`politiclaw_draft_outreach`](../reference/generated/tools/politiclaw_draft_outreach). It takes the same inputs (rep, issue, optional bill), drafts a tighter script (≤150 words), and uses the rep's stored office phone number — never a number the agent invents. Like the letter tool, it drafts only; the user makes the call themselves.

## Setup prerequisites

The tool requires a declared issue stance. If the user has not set one yet, start with [`politiclaw_configure`](../reference/generated/tools/politiclaw_configure) or [`politiclaw_issue_stances`](../reference/generated/tools/politiclaw_issue_stances).
