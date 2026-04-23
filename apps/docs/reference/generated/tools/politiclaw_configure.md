# politiclaw_configure

- Label: Configure PolitiClaw
- Group: Configuration and preferences
- Source file: `packages/politiclaw-plugin/src/tools/configure.ts`

## Description

One front-door tool that walks the user through PolitiClaw setup end-to-end: address → top issues → monitoring mode → accountability preference → final monitoring contract. Call with whatever you have; the tool returns the next question to ask. When everything is collected it reconciles cron jobs once and returns stage:'complete' with a monitoringContract summary. Use this for first-time setup, reconfiguration, or any 'set up PolitiClaw / change my settings' request. Lower-level stance/mode tools still exist for one-off edits after setup is complete.

## Parameters

| Name | Required | Type | Description |
| --- | --- | --- | --- |
| `stage` | no | `"address" \| "issues" \| "monitoring" \| "accountability" \| "complete"` | Optional hint for which stage you intend this call to satisfy. The tool re-derives the next stage from DB state regardless, so a wrong hint just no-ops. |
| `address` | no | `string` | Street address. When provided, saves it and refreshes reps for that address. |
| `zip` | no | `string` |  |
| `state` | no | `string` | 2-letter state code (e.g., CA). |
| `district` | no | `string` | Congressional district if known. |
| `issueMode` | no | `"conversation" \| "quiz"` | Issue-setup style. Use when you want the issues stage to return a quiz or conversational handoff. |
| `mode` | no | `"conversation" \| "quiz"` | Deprecated alias for issueMode. Prefer issueMode. |
| `issueStances` | no | `object[]` |  |
| `monitoringMode` | no | `"off" \| "quiet_watch" \| "weekly_digest" \| "action_only" \| "full_copilot"` | How PolitiClaw should watch for you. 'off' pauses everything. 'quiet_watch' is silent unless tracked bills/hearings materially change. 'weekly_digest' adds the Sunday summary and monthly rep report. 'action_only' is quiet except when elections are near or tracked items change. 'full_copilot' enables everything. Defaults to 'action_only' when first configuring unless a mode is already saved. |
| `accountability` | no | `"self_serve" \| "nudge_me" \| "draft_for_me"` | How proactive PolitiClaw should be when bills/votes cross your alignment threshold: self_serve (post deltas only), nudge_me (add a 'Your move' section with suggestions), draft_for_me (also draft a letter to your rep proactively). |
| `refreshReps` | no | `boolean` | When true, bypass the reps cache and re-resolve representatives. |

## Raw Schema

```json
{
  "type": "object",
  "properties": {
    "stage": {
      "description": "Optional hint for which stage you intend this call to satisfy. The tool re-derives the next stage from DB state regardless, so a wrong hint just no-ops.",
      "anyOf": [
        {
          "const": "address",
          "type": "string"
        },
        {
          "const": "issues",
          "type": "string"
        },
        {
          "const": "monitoring",
          "type": "string"
        },
        {
          "const": "accountability",
          "type": "string"
        },
        {
          "const": "complete",
          "type": "string"
        }
      ]
    },
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
    "issueMode": {
      "description": "Issue-setup style. Use when you want the issues stage to return a quiz or conversational handoff.",
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
    "mode": {
      "description": "Deprecated alias for issueMode. Prefer issueMode.",
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
    "monitoringMode": {
      "description": "How PolitiClaw should watch for you. 'off' pauses everything. 'quiet_watch' is silent unless tracked bills/hearings materially change. 'weekly_digest' adds the Sunday summary and monthly rep report. 'action_only' is quiet except when elections are near or tracked items change. 'full_copilot' enables everything. Defaults to 'action_only' when first configuring unless a mode is already saved.",
      "anyOf": [
        {
          "const": "off",
          "type": "string"
        },
        {
          "const": "quiet_watch",
          "type": "string"
        },
        {
          "const": "weekly_digest",
          "type": "string"
        },
        {
          "const": "action_only",
          "type": "string"
        },
        {
          "const": "full_copilot",
          "type": "string"
        }
      ]
    },
    "accountability": {
      "description": "How proactive PolitiClaw should be when bills/votes cross your alignment threshold: self_serve (post deltas only), nudge_me (add a 'Your move' section with suggestions), draft_for_me (also draft a letter to your rep proactively).",
      "anyOf": [
        {
          "const": "self_serve",
          "type": "string"
        },
        {
          "const": "nudge_me",
          "type": "string"
        },
        {
          "const": "draft_for_me",
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
