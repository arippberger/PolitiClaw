# politiclaw_prepare_me_for_my_next_election

- Label: Prepare one readable guide for the user's next election
- Group: Ballot and election prep
- Source file: `packages/politiclaw-plugin/src/tools/prepareForElection.ts`

## Description

Map the ballot against the values the user declared: composes saved address, declared stances, stored reps' alignment records, and ballot snapshot into one readable guide so the user can see how each contest and incumbent lines up with — or diverges from — their stated stances. Runs the prereq checks itself; missing address, missing reps, or missing stances return a 'setup needed' pointer at the exact tool to run, not a stack trace. Use this as the default when the user says 'help me with my ballot' or 'what do I need to know for the election.' Framing is facts + tradeoffs; it never tells the user how to vote. Atomic tools (politiclaw_explain_my_ballot, politiclaw_score_representative, politiclaw_research_candidate) remain available for focused follow-ups.

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
