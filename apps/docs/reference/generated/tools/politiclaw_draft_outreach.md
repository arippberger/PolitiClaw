# politiclaw_draft_outreach

- Label: Draft a letter or call script for a representative
- Group: Candidate research and outreach
- Source file: `packages/politiclaw-plugin/src/tools/draftOutreach.ts`

## Description

Put an accountability question in front of a rep on the user's behalf. Pass format='letter' for a polite, sourced copy-paste-ready email-style letter (≤400 words) — supports an optional customNote. Pass format='call' for a short phone-call script (≤150 words) using the rep's office phone number from the stored record — supports an optional oneSpecificSentence. Both formats are deterministic slot-fill (no LLM) and require a declared stance on the issue (politiclaw_issue_stances). Output is copy-paste ready for the user's own client — PolitiClaw never sends or dials. Drafts persist in their respective tables for audit. Citing a bill requires plugins.entries.politiclaw.config.apiKeys.apiDataGov for bill lookup.

## Parameters

| Name | Required | Type | Description |
| --- | --- | --- | --- |
| `format` | yes | `"letter" \| "call"` | 'letter' produces a copy-paste-ready email-style letter (≤400 words). 'call' produces a short phone-call script (≤150 words) with the rep's office phone number from the stored record. |
| `repId` | yes | `string` | Stable rep id (bioguide when available). Call politiclaw_get_my_reps first to look it up. |
| `issue` | yes | `string` | Issue slug from your declared stances (e.g. 'affordable-housing'). Must already be set via politiclaw_issue_stances. |
| `billId` | no | `string` | Optional canonical bill id ('119-hr-1234'). When present the draft cites the specific bill. |
| `customNote` | no | `string` | Used only with format='letter'. Optional one-sentence personal hook appended verbatim above the closing. Keep short — the draft is already near its word ceiling. |
| `oneSpecificSentence` | no | `string` | Used only with format='call'. Optional single sentence the user wants to say in their own words. Appended verbatim after the ask line. Keep it short — the script is capped at 150 words. |

## Raw Schema

```json
{
  "type": "object",
  "required": [
    "format",
    "repId",
    "issue"
  ],
  "properties": {
    "format": {
      "description": "'letter' produces a copy-paste-ready email-style letter (≤400 words). 'call' produces a short phone-call script (≤150 words) with the rep's office phone number from the stored record.",
      "anyOf": [
        {
          "const": "letter",
          "type": "string"
        },
        {
          "const": "call",
          "type": "string"
        }
      ]
    },
    "repId": {
      "description": "Stable rep id (bioguide when available). Call politiclaw_get_my_reps first to look it up.",
      "type": "string"
    },
    "issue": {
      "description": "Issue slug from your declared stances (e.g. 'affordable-housing'). Must already be set via politiclaw_issue_stances.",
      "type": "string"
    },
    "billId": {
      "description": "Optional canonical bill id ('119-hr-1234'). When present the draft cites the specific bill.",
      "type": "string"
    },
    "customNote": {
      "description": "Used only with format='letter'. Optional one-sentence personal hook appended verbatim above the closing. Keep short — the draft is already near its word ceiling.",
      "type": "string"
    },
    "oneSpecificSentence": {
      "description": "Used only with format='call'. Optional single sentence the user wants to say in their own words. Appended verbatim after the ask line. Keep it short — the script is capped at 150 words.",
      "type": "string"
    }
  }
}
```
