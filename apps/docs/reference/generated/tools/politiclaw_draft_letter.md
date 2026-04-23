# politiclaw_draft_letter

- Label: Draft a letter to a representative
- Group: Candidate research and outreach
- Source file: `packages/politiclaw-plugin/src/tools/draftLetter.ts`

## Description

Put an accountability question in front of a rep on the user's behalf: a polite, sourced letter that states the user's declared stance and asks the rep where they stand on the same issue, optionally citing a specific federal bill. Deterministic slot-fill (no LLM). Output is copy-paste ready for the user's own email client — PolitiClaw never sends mail; the user sends from their own client. Letters are capped at 400 words and persist in the letters table for audit. Requires a declared stance on the issue (politiclaw_set_issue_stance) and, when citing a bill, plugins.politiclaw.apiKeys.apiDataGov for bill lookup.

## Parameters

| Name | Required | Type | Description |
| --- | --- | --- | --- |
| `repId` | yes | `string` | Stable rep id (bioguide when available). Call politiclaw_get_my_reps first to look it up. |
| `issue` | yes | `string` | Issue slug from your declared stances (e.g. 'affordable-housing'). Must already be set via politiclaw_set_issue_stance. |
| `billId` | no | `string` | Optional canonical bill id ('119-hr-1234'). When present the letter cites the specific bill. |
| `customNote` | no | `string` | Optional one-sentence personal hook appended verbatim above the closing. Keep short — the draft is already near its word ceiling. |

## Raw Schema

```json
{
  "type": "object",
  "required": [
    "repId",
    "issue"
  ],
  "properties": {
    "repId": {
      "description": "Stable rep id (bioguide when available). Call politiclaw_get_my_reps first to look it up.",
      "type": "string"
    },
    "issue": {
      "description": "Issue slug from your declared stances (e.g. 'affordable-housing'). Must already be set via politiclaw_set_issue_stance.",
      "type": "string"
    },
    "billId": {
      "description": "Optional canonical bill id ('119-hr-1234'). When present the letter cites the specific bill.",
      "type": "string"
    },
    "customNote": {
      "description": "Optional one-sentence personal hook appended verbatim above the closing. Keep short — the draft is already near its word ceiling.",
      "type": "string"
    }
  }
}
```
