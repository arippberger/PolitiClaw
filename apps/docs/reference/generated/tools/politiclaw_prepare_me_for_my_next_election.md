# politiclaw_prepare_me_for_my_next_election

- Label: Prepare one readable guide for the user's next election
- Group: Ballot and election prep
- Source file: `packages/politiclaw-plugin/src/tools/prepareForElection.ts`

## Description

Meta-tool: composes the user's saved address, declared stances, stored reps, and ballot snapshot into one readable election guide. Runs the prereq checks itself — missing address, missing reps, or missing stances return a 'setup needed' pointer at the exact tool to run, not a stack trace. Use this as the default when the user says 'help me with my ballot' or 'what do I need to know for the election.' Atomic tools (politiclaw_explain_my_ballot, politiclaw_score_representative, politiclaw_research_candidate) remain available for focused follow-ups.

## Parameters

| Name | Required | Type | Description |
| --- | --- | --- | --- |
| `refresh` | no | `boolean` | When true, bypass the ballot-snapshot cache and re-query voterInfoQuery. |

## Raw Schema

```json
{
  "type": "object",
  "properties": {
    "refresh": {
      "description": "When true, bypass the ballot-snapshot cache and re-query voterInfoQuery.",
      "type": "boolean"
    }
  }
}
```
