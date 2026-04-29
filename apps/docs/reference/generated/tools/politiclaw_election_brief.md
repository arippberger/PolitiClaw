# politiclaw_election_brief

- Label: One readable election guide: ballot framing + rep alignment + setup checks
- Group: Ballot and election prep
- Source file: `packages/politiclaw-plugin/src/tools/electionBrief.ts`

## Description

Map the user's ballot against the values they declared: composes saved address, declared stances, stored reps' alignment records, and ballot snapshot into one readable guide so the user can see how each contest and incumbent lines up with — or diverges from — their stated stances. Runs the prereq checks itself; missing address, missing reps, or missing stances return a 'setup needed' pointer at the exact tool to run, not a stack trace. Use this as the default when the user says 'help me with my ballot' or 'what do I need to know for the election.' Framing is facts + tradeoffs; it never tells the user how to vote. politiclaw_get_my_ballot remains available for the raw fetch when you only need the ballot data.

## Parameters

| Name | Required | Type | Description |
| --- | --- | --- | --- |
| `refresh` | no | `boolean` | When true, bypass the cached ballot snapshot and re-query voterInfoQuery. |

## Raw Schema

```json
{
  "type": "object",
  "properties": {
    "refresh": {
      "description": "When true, bypass the cached ballot snapshot and re-query voterInfoQuery.",
      "type": "boolean"
    }
  }
}
```
