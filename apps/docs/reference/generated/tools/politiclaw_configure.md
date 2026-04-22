# politiclaw_configure

- Label: Configure PolitiClaw
- Group: Configuration and preferences
- Source file: `packages/politiclaw-plugin/src/tools/configure.ts`

## Description

Single front door for PolitiClaw setup and reconfiguration. Saves or updates the user's address, resolves reps, runs issue-stance setup, and applies monitoring cadence in one flow. When information is missing, returns the next setup step instead of requiring separate setup tools.

## Parameters

| Name | Required | Type | Description |
| --- | --- | --- | --- |
| `address` | no | `string` | Street address. When provided, saves it and refreshes reps for that address. |
| `zip` | no | `string` |  |
| `state` | no | `string` | 2-letter state code (e.g., CA). |
| `district` | no | `string` | Congressional district if known. |
| `mode` | no | `"conversation" \| "quiz"` | Optional issue-setup style. Use when the user is ready to walk through stance setup. |
| `issueStances` | no | `object[]` |  |
| `monitoringCadence` | no | `"off" \| "election_proximity" \| "weekly" \| "both"` | How loud PolitiClaw monitoring should be. Defaults to election_proximity when first configuring unless a cadence is already saved. |
| `refreshReps` | no | `boolean` | When true, bypass the reps cache and re-resolve representatives. |

## Raw Schema

```json
{
  "type": "object",
  "properties": {
    "address": {
      "description": "Street address. When provided, saves it and refreshes reps for that address.",
      "type": "string"
    },
    "zip": {
      "type": "string"
    },
    "state": {
      "description": "2-letter state code (e.g., CA).",
      "type": "string"
    },
    "district": {
      "description": "Congressional district if known.",
      "type": "string"
    },
    "mode": {
      "description": "Optional issue-setup style. Use when the user is ready to walk through stance setup.",
      "anyOf": [
        {
          "const": "conversation",
          "type": "string"
        },
        {
          "const": "quiz",
          "type": "string"
        }
      ]
    },
    "issueStances": {
      "additionalProperties": false,
      "type": "array",
      "items": {
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
    },
    "monitoringCadence": {
      "description": "How loud PolitiClaw monitoring should be. Defaults to election_proximity when first configuring unless a cadence is already saved.",
      "anyOf": [
        {
          "const": "off",
          "type": "string"
        },
        {
          "const": "election_proximity",
          "type": "string"
        },
        {
          "const": "weekly",
          "type": "string"
        },
        {
          "const": "both",
          "type": "string"
        }
      ]
    },
    "refreshReps": {
      "description": "When true, bypass the reps cache and re-resolve representatives.",
      "type": "boolean"
    }
  }
}
```
