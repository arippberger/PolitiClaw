# politiclaw_start_onboarding

- Label: Start PolitiClaw onboarding (conversation or quiz)
- Group: Preferences and onboarding
- Source file: `packages/politiclaw-plugin/src/tools/onboarding.ts`

## Description

Bootstraps the issue-stance set for a new (or returning) user. Input: optional `mode` of "conversation" or "quiz". When omitted, returns a choice prompt for the skill to forward to the user. When set, returns everything the skill needs to conduct the flow — opening prompts + canonical slugs for conversation, or the full question bank for quiz — plus any existing stances so returning users skip already-answered topics. Answers are persisted via politiclaw_set_issue_stance.

## Parameters

| Name | Required | Type | Description |
| --- | --- | --- | --- |
| `mode` | no | `"conversation" \| "quiz"` | Onboarding interaction style. Omit to receive a choice prompt the skill can forward to the user. |

## Raw Schema

```json
{
  "type": "object",
  "properties": {
    "mode": {
      "description": "Onboarding interaction style. Omit to receive a choice prompt the skill can forward to the user.",
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
    }
  }
}
```
