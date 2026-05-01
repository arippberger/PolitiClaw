# politiclaw_configure

- Label: Configure PolitiClaw
- Group: Configuration and preferences
- Source file: `packages/politiclaw-plugin/src/tools/configure.ts`

## Description

One front-door tool that walks the user through PolitiClaw setup end-to-end: address → top issues → monitoring mode → accountability preference → api.data.gov key (and optional upgrades) → final monitoring contract. Call with whatever you have; the tool returns the next question to ask. Pass `apiDataGov` (and any `optionalApiKeys` the user has) inline to save them in one shot — the gateway will restart once. When everything is collected it reconciles cron jobs once and returns stage:'complete' with a monitoringContract summary. Use this for first-time setup, reconfiguration, or any 'set up PolitiClaw / change my settings' request — including key-only updates after onboarding. Lower-level stance/mode tools still exist for one-off edits after setup is complete.

## Parameters

| Name | Required | Type | Description |
| --- | --- | --- | --- |
| `stage` | no | `"address" \| "issues" \| "monitoring" \| "accountability" \| "api_key" \| "complete"` | Optional hint for which stage you intend this call to satisfy. The tool re-derives the next stage from DB state regardless, so a wrong hint just no-ops. |
| `address` | no | `string` | Street address. When provided, saves it and refreshes reps for that address. |
| `zip` | no | `string` |  |
| `state` | no | `string` | 2-letter state code (e.g., CA). |
| `district` | no | `string` | Congressional district if known. |
| `issueMode` | no | `"conversation" \| "quiz"` | Issue-setup style. Use when you want the issues stage to return a quiz or conversational handoff. |
| `mode` | no | `"conversation" \| "quiz"` | Deprecated alias for issueMode. Prefer issueMode. |
| `issueStances` | no | `object[]` |  |
| `monitoringMode` | no | `"off" \| "quiet_watch" \| "weekly_digest" \| "action_only" \| "full_copilot"` | How PolitiClaw should watch for you. Pass one of: 'off' (Paused — nothing runs on its own), 'quiet_watch' (Quiet watch — silent unless tracked bills/hearings materially change), 'weekly_digest' (Weekly digest — Sunday summary plus monthly rep report), 'action_only' (Action only — quiet except when elections are near or tracked items change), 'full_copilot' (Full copilot — everything on). Read the parenthetical labels to the user, never the enum. Defaults to 'action_only' when first configuring unless a mode is already saved. |
| `accountability` | no | `"self_serve" \| "nudge_me" \| "draft_for_me"` | How proactive PolitiClaw should be when bills/votes cross your alignment threshold. Pass one of: 'self_serve' (Self-serve — post deltas only, default), 'nudge_me' (Nudge me — add a 'Your move' section with suggestions), 'draft_for_me' (Draft for me — also draft a letter to your rep proactively). Read the parenthetical labels to the user, never the enum. |
| `refreshReps` | no | `boolean` | When true, bypass the reps cache and re-resolve representatives. |
| `apiDataGov` | no | `string` | Required api.data.gov key (free, instant signup at https://api.data.gov/signup/). When supplied, the tool persists it directly to plugins.entries.politiclaw.config.apiKeys.apiDataGov and the gateway restarts to pick it up. |
| `optionalApiKeys` | no | `object` | Optional upgrade keys to save in the same call as apiDataGov so the gateway only restarts once. Pass only the keys the user actually has. |

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
          "const": "api_key",
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
          },
          "note": {
            "description": "Short paraphrase of the user's specific concern within this issue bucket. Surfaced in letters, call scripts, rep reports, and the monitoring contract.",
            "type": "string"
          },
          "sourceText": {
            "description": "Verbatim user phrasing that prompted this stance, preserved for later drafting context.",
            "type": "string"
          }
        }
      }
    },
    "monitoringMode": {
      "description": "How PolitiClaw should watch for you. Pass one of: 'off' (Paused — nothing runs on its own), 'quiet_watch' (Quiet watch — silent unless tracked bills/hearings materially change), 'weekly_digest' (Weekly digest — Sunday summary plus monthly rep report), 'action_only' (Action only — quiet except when elections are near or tracked items change), 'full_copilot' (Full copilot — everything on). Read the parenthetical labels to the user, never the enum. Defaults to 'action_only' when first configuring unless a mode is already saved.",
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
      "description": "How proactive PolitiClaw should be when bills/votes cross your alignment threshold. Pass one of: 'self_serve' (Self-serve — post deltas only, default), 'nudge_me' (Nudge me — add a 'Your move' section with suggestions), 'draft_for_me' (Draft for me — also draft a letter to your rep proactively). Read the parenthetical labels to the user, never the enum.",
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
    },
    "apiDataGov": {
      "description": "Required api.data.gov key (free, instant signup at https://api.data.gov/signup/). When supplied, the tool persists it directly to plugins.entries.politiclaw.config.apiKeys.apiDataGov and the gateway restarts to pick it up.",
      "type": "string"
    },
    "optionalApiKeys": {
      "additionalProperties": false,
      "description": "Optional upgrade keys to save in the same call as apiDataGov so the gateway only restarts once. Pass only the keys the user actually has.",
      "type": "object",
      "properties": {
        "geocodio": {
          "type": "string"
        },
        "openStates": {
          "type": "string"
        },
        "legiscan": {
          "type": "string"
        },
        "openSecrets": {
          "type": "string"
        },
        "followTheMoney": {
          "type": "string"
        },
        "voteSmart": {
          "type": "string"
        },
        "democracyWorks": {
          "type": "string"
        },
        "cicero": {
          "type": "string"
        },
        "ballotReady": {
          "type": "string"
        },
        "googleCivic": {
          "type": "string"
        }
      }
    }
  }
}
```
