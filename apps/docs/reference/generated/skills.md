# Generated Skills Reference

This page is generated from the skill front matter files in `packages/politiclaw-plugin/skills`.

Current skill count: 5.

| Skill | Directory | Summary |
| --- | --- | --- |
| `politiclaw-ballot` | `politiclaw-ballot` | How to help users understand upcoming elections without prescribing votes. Enforces no prescriptive recommendations and strict guardrails on when LLM-search-derived narrative is allowed. |
| `politiclaw-monitoring` | `politiclaw-monitoring` | How to run the PolitiClaw monitoring loop. Frames every monitoring output around whether representatives acted consistently with the user's declared stances. Decides when to alert, when to summarize, and when to stay silent. Enforces the anti-echo-chamber rule that every substantial summary must include a dissenting or complicating view when one exists. |
| `politiclaw-onboarding` | `politiclaw-onboarding` | How to run the initial issue-stance setup with a new PolitiClaw user. Offers two modes — a guided conversation and a structured quiz — and persists results through politiclaw_set_issue_stance. These declared stances are the baseline PolitiClaw uses to score representative accountability; no score exists without them. |
| `politiclaw-outreach` | `politiclaw-outreach` | How to help a user contact their representatives. Covers when to offer a letter draft, how to use politiclaw_draft_letter, and the firm rule that PolitiClaw never sends mail — the user sends from their own client. |
| `politiclaw-summary` | `politiclaw-summary` | Weekly PolitiClaw digest style. One message, readable in ~60 seconds, with a mandatory "things you might be surprised by" section. |

## politiclaw-ballot

- Source file: `packages/politiclaw-plugin/skills/politiclaw-ballot/SKILL.md`
- Description: How to help users understand upcoming elections without prescribing votes. Enforces no prescriptive recommendations and strict guardrails on when LLM-search-derived narrative is allowed.
- Read when:
  - The user asks about their ballot, candidates, measures, or election day logistics.
  - politiclaw_get_my_ballot, politiclaw_research_candidate, politiclaw_explain_my_ballot, or politiclaw_research_challengers tools are invoked (when implemented).

## politiclaw-monitoring

- Source file: `packages/politiclaw-plugin/skills/politiclaw-monitoring/SKILL.md`
- Description: How to run the PolitiClaw monitoring loop. Frames every monitoring output around whether representatives acted consistently with the user's declared stances. Decides when to alert, when to summarize, and when to stay silent. Enforces the anti-echo-chamber rule that every substantial summary must include a dissenting or complicating view when one exists.
- Read when:
  - A PolitiClaw cron template fires (weekly_summary, rep_vote_watch, tracked_hearings, rep_report).
  - The user invokes politiclaw_check_upcoming_votes directly and asks for a summary.
  - The user runs `politiclaw_rep_report` or the `rep_report` cron job fires.

## politiclaw-onboarding

- Source file: `packages/politiclaw-plugin/skills/politiclaw-onboarding/SKILL.md`
- Description: How to run the initial issue-stance setup with a new PolitiClaw user. Offers two modes — a guided conversation and a structured quiz — and persists results through politiclaw_set_issue_stance. These declared stances are the baseline PolitiClaw uses to score representative accountability; no score exists without them.
- Read when:
  - The user asks to "set up PolitiClaw", "get started", or "help me pick my issues".
  - The politiclaw_configure tool is invoked and returns an issue-setup handoff.
  - A user with zero declared issue stances asks anything that would require them.

## politiclaw-outreach

- Source file: `packages/politiclaw-plugin/skills/politiclaw-outreach/SKILL.md`
- Description: How to help a user contact their representatives. Covers when to offer a letter draft, how to use politiclaw_draft_letter, and the firm rule that PolitiClaw never sends mail — the user sends from their own client.
- Read when:
  - The user asks "can you write a letter to my rep" or similar outreach phrasing.
  - The user says they want to contact, email, call, or complain to a representative on a specific issue or bill.
  - politiclaw_draft_letter has been invoked and you are rendering its output.

## politiclaw-summary

- Source file: `packages/politiclaw-plugin/skills/politiclaw-summary/SKILL.md`
- Description: Weekly PolitiClaw digest style. One message, readable in ~60 seconds, with a mandatory "things you might be surprised by" section.
- Read when:
  - The weekly_summary cron template fires.
  - The user explicitly asks for a weekly roll-up of PolitiClaw activity.
