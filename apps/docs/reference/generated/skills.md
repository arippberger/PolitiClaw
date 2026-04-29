# Generated Skills Reference

This page is generated from the skill front matter files in `packages/politiclaw-plugin/skills`.

Current skill count: 5.

| Skill | Directory | Summary |
| --- | --- | --- |
| `politiclaw-ballot` | `politiclaw-ballot` | How to map each contest on the user's ballot against the stances they declared — showing where candidates and incumbents align with their values and where they don't — without prescribing votes. Enforces no prescriptive recommendations and strict guardrails on when LLM-search-derived narrative is allowed. |
| `politiclaw-monitoring` | `politiclaw-monitoring` | How to surface bills, votes, and committee events that touch the stances the user declared — so they can see when their reps are (or aren't) representing them — without drifting into advocacy. Decides when to alert, when to summarize, and when to stay silent. Enforces the anti-echo-chamber rule that every substantial summary must include a dissenting or complicating view when one exists, and the four-class alert shape that every proactive message follows (headline, why-it-matters, what-happened, optional next). |
| `politiclaw-onboarding` | `politiclaw-onboarding` | How to drive `politiclaw_configure` end-to-end — a single staged tool that walks the user through address → top issues → monitoring mode → accountability → final monitoring contract. The tool re-derives the current stage from DB state on every call; you just relay the prompt and collect the next answer. |
| `politiclaw-outreach` | `politiclaw-outreach` | How to help the user close the loop on a stance-gap the monitoring loop surfaced: put an accountability question in front of the rep in the user's own words. Covers when to offer a letter or call draft, how to use politiclaw_draft_outreach, and the firm rule that PolitiClaw never sends mail or dials — the user sends from their own client. |
| `politiclaw-summary` | `politiclaw-summary` | Weekly PolitiClaw digest style: what the user's reps did this week against the stances they declared. One message, readable in ~60 seconds, facts not cheerleading, built on the tool's tier-1/tier-2/tail bundling and a mandatory "things you might be surprised by" section. |

## politiclaw-ballot

- Source file: `packages/politiclaw-plugin/skills/politiclaw-ballot/SKILL.md`
- Description: How to map each contest on the user's ballot against the stances they declared — showing where candidates and incumbents align with their values and where they don't — without prescribing votes. Enforces no prescriptive recommendations and strict guardrails on when LLM-search-derived narrative is allowed.
- Read when:
  - The user asks about their ballot, candidates, measures, or election day logistics.
  - politiclaw_get_my_ballot, politiclaw_research_finance, or politiclaw_election_brief tools are invoked.

## politiclaw-monitoring

- Source file: `packages/politiclaw-plugin/skills/politiclaw-monitoring/SKILL.md`
- Description: How to surface bills, votes, and committee events that touch the stances the user declared — so they can see when their reps are (or aren't) representing them — without drifting into advocacy. Decides when to alert, when to summarize, and when to stay silent. Enforces the anti-echo-chamber rule that every substantial summary must include a dissenting or complicating view when one exists, and the four-class alert shape that every proactive message follows (headline, why-it-matters, what-happened, optional next).
- Read when:
  - A PolitiClaw cron template fires (weekly_summary, rep_vote_watch, tracked_hearings, rep_report).
  - The user invokes politiclaw_check_upcoming_votes directly and asks for a summary.
  - The user runs `politiclaw_rep_report` or the `rep_report` cron job fires.

## politiclaw-onboarding

- Source file: `packages/politiclaw-plugin/skills/politiclaw-onboarding/SKILL.md`
- Description: How to drive `politiclaw_configure` end-to-end — a single staged tool that walks the user through address → top issues → monitoring mode → accountability → final monitoring contract. The tool re-derives the current stage from DB state on every call; you just relay the prompt and collect the next answer.
- Read when:
  - The user asks to "set up PolitiClaw", "get started", or "change my settings".
  - The user asks "what is PolitiClaw doing for me?" / "what are you watching?".
  - A user with no preferences asks anything that would require them.
  - You see a `politiclaw_configure` response with a `nextPrompt` field.

## politiclaw-outreach

- Source file: `packages/politiclaw-plugin/skills/politiclaw-outreach/SKILL.md`
- Description: How to help the user close the loop on a stance-gap the monitoring loop surfaced: put an accountability question in front of the rep in the user's own words. Covers when to offer a letter or call draft, how to use politiclaw_draft_outreach, and the firm rule that PolitiClaw never sends mail or dials — the user sends from their own client.
- Read when:
  - The user asks "can you write a letter to my rep" or similar outreach phrasing.
  - The user says they want to contact, email, call, or complain to a representative on a specific issue or bill.
  - politiclaw_draft_outreach has been invoked and you are rendering its output.

## politiclaw-summary

- Source file: `packages/politiclaw-plugin/skills/politiclaw-summary/SKILL.md`
- Description: Weekly PolitiClaw digest style: what the user's reps did this week against the stances they declared. One message, readable in ~60 seconds, facts not cheerleading, built on the tool's tier-1/tier-2/tail bundling and a mandatory "things you might be surprised by" section.
- Read when:
  - The weekly_summary cron template fires.
  - The user explicitly asks for a weekly roll-up of PolitiClaw activity.
