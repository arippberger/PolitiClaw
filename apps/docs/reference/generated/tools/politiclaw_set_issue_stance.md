# politiclaw_set_issue_stance

- Label: Set a declared issue stance
- Group: Configuration and preferences
- Source file: `packages/politiclaw-plugin/src/tools/preferences.ts`

## Description

Record the user's declared position (support / oppose / neutral) on a named policy issue, with a 1-5 importance weight. Drives bill alignment scoring and rep scoring. Re-running with the same issue overwrites the previous stance.

## Parameters

| Name | Required | Type | Description |
| --- | --- | --- | --- |
| `issue` | yes | `string` | Issue label. Normalized to lowercase kebab-case (e.g. 'Affordable Housing' → 'affordable-housing'). |
| `stance` | yes | `"support" \| "oppose" \| "neutral"` |  |
| `weight` | no | `integer` | How strongly the user cares (1-5). Defaults to 3. |

## Raw Schema

```json
{
  "type": "object",
  "required": [
    "issue",
    "stance"
  ],
  "properties": {
    "issue": {
      "description": "Issue label. Normalized to lowercase kebab-case (e.g. 'Affordable Housing' → 'affordable-housing').",
      "type": "string"
    },
    "stance": {
      "anyOf": [
        {
          "const": "support",
          "type": "string"
        },
        {
          "const": "oppose",
          "type": "string"
        },
        {
          "const": "neutral",
          "type": "string"
        }
      ]
    },
    "weight": {
      "minimum": 1,
      "maximum": 5,
      "description": "How strongly the user cares (1-5). Defaults to 3.",
      "type": "integer"
    }
  }
}
```
