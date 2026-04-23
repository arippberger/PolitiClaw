# politiclaw_draft_call_script

- Label: Draft a short call script for a rep's office
- Group: Candidate research and outreach
- Source file: `packages/politiclaw-plugin/src/tools/callScript.ts`

## Description

Draft a ≤150-word call script the user can read to their rep's office on a declared issue, optionally citing a specific federal bill. Deterministic slot-fill (no LLM). Phone numbers come from the stored rep contact record — never invented. PolitiClaw never dials; the output is copy-paste ready for the user. Requires a declared stance (politiclaw_set_issue_stance) and, when citing a bill, plugins.politiclaw.apiKeys.apiDataGov.

## Parameters

| Name | Required | Type | Description |
| --- | --- | --- | --- |
| `repId` | yes | `string` | Stable rep id (bioguide when available). Call politiclaw_get_my_reps first to look it up. |
| `issue` | yes | `string` | Issue slug from your declared stances (e.g. 'affordable-housing'). Must already be set via politiclaw_set_issue_stance. |
| `billId` | no | `string` | Optional canonical bill id ('119-hr-1234'). When present the script cites the specific bill. |
| `oneSpecificSentence` | no | `string` | Optional single sentence the user wants to say in their own words. Appended verbatim after the ask line. Keep it short — the script is capped at 150 words. |

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
      "description": "Optional canonical bill id ('119-hr-1234'). When present the script cites the specific bill.",
      "type": "string"
    },
    "oneSpecificSentence": {
      "description": "Optional single sentence the user wants to say in their own words. Appended verbatim after the ask line. Keep it short — the script is capped at 150 words.",
      "type": "string"
    }
  }
}
```
