# politiclaw_score_bill

- Label: Score a bill against your declared stances
- Group: Bills and votes
- Source file: `packages/politiclaw-plugin/src/tools/scoring.ts`

## Description

Compute how much a federal bill touches the user's declared issue stances. Deterministic (no LLM): matches policy area, subjects, title, and summary against each declared stance. Reports relevance and confidence; confidence below the 0.4 floor renders as "insufficient data". Rationale names specific matched subjects (never abstract generalities). Requires declared issue stances (see politiclaw_issue_stances with action='set') and plugins.entries.politiclaw.config.apiKeys.apiDataGov for the bill source.

## Parameters

| Name | Required | Type | Description |
| --- | --- | --- | --- |
| `billId` | no | `string` | Canonical bill id: '&lt;congress&gt;-&lt;billType&gt;-&lt;number&gt;', e.g. '119-hr-1234'. |
| `congress` | no | `integer` |  |
| `billType` | no | `string` |  |
| `number` | no | `string` |  |
| `refresh` | no | `boolean` | When true, bypass the bill-detail cache and re-fetch. |

## Raw Schema

```json
{
  "type": "object",
  "properties": {
    "billId": {
      "description": "Canonical bill id: '<congress>-<billType>-<number>', e.g. '119-hr-1234'.",
      "type": "string"
    },
    "congress": {
      "minimum": 1,
      "type": "integer"
    },
    "billType": {
      "type": "string"
    },
    "number": {
      "type": "string"
    },
    "refresh": {
      "description": "When true, bypass the bill-detail cache and re-fetch.",
      "type": "boolean"
    }
  }
}
```
