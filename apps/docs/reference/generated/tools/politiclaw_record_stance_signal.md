# politiclaw_record_stance_signal

- Label: Record PolitiClaw stance signal
- Group: Configuration and preferences
- Source file: `packages/politiclaw-plugin/src/tools/preferences.ts`

## Description

Record a single agree/disagree/skip signal from the user in response to a shown bill or issue. Later scoring can aggregate these signals into learned issue stances; this tool only records the raw signal.

## Parameters

| Name | Required | Type | Description |
| --- | --- | --- | --- |
| `direction` | yes | `"agree" \| "disagree" \| "skip"` |  |
| `source` | yes | `"onboarding" \| "monitoring" \| "dashboard"` |  |
| `issue` | no | `string` | Issue slug, e.g. 'climate'. |
| `billId` | no | `string` | Bill id this signal applies to. |
| `weight` | no | `number` | Signal strength (&gt; 0); defaults to 1.0. |

## Raw Schema

```json
{
  "type": "object",
  "required": [
    "direction",
    "source"
  ],
  "properties": {
    "direction": {
      "anyOf": [
        {
          "const": "agree",
          "type": "string"
        },
        {
          "const": "disagree",
          "type": "string"
        },
        {
          "const": "skip",
          "type": "string"
        }
      ]
    },
    "source": {
      "anyOf": [
        {
          "const": "onboarding",
          "type": "string"
        },
        {
          "const": "monitoring",
          "type": "string"
        },
        {
          "const": "dashboard",
          "type": "string"
        }
      ]
    },
    "issue": {
      "description": "Issue slug, e.g. 'climate'.",
      "type": "string"
    },
    "billId": {
      "description": "Bill id this signal applies to.",
      "type": "string"
    },
    "weight": {
      "exclusiveMinimum": 0,
      "description": "Signal strength (> 0); defaults to 1.0.",
      "type": "number"
    }
  }
}
```
