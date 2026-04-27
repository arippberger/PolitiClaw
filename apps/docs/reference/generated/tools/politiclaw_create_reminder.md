# politiclaw_create_reminder

- Label: Create a reminder anchored to a bill, event, or election
- Group: Monitoring and cadence
- Source file: `packages/politiclaw-plugin/src/tools/reminder.ts`

## Description

Persist a reminder with a slot-filled checklist anchored to a bill, upcoming committee event, or election date. Reminders do not self-notify; the existing monitoring crons re-read them and surface ones whose deadline is within 48 hours. Use this when the user says 'remind me' rather than 'draft' — letters/call scripts are separate flows.

## Parameters

| Name | Required | Type | Description |
| --- | --- | --- | --- |
| `title` | yes | `string` | Short user-facing label for the reminder. |
| `deadline` | no | `string` | Optional ISO-8601 date or datetime. When set, the monitoring crons surface the reminder as it comes due. |
| `anchor` | yes | `object \| object \| object` |  |
| `extraSteps` | no | `string[]` | Optional user-supplied checklist items appended verbatim in order. |

## Raw Schema

```json
{
  "type": "object",
  "required": [
    "title",
    "anchor"
  ],
  "properties": {
    "title": {
      "minLength": 1,
      "description": "Short user-facing label for the reminder.",
      "type": "string"
    },
    "deadline": {
      "minLength": 1,
      "description": "Optional ISO-8601 date or datetime. When set, the monitoring crons surface the reminder as it comes due.",
      "type": "string"
    },
    "anchor": {
      "anyOf": [
        {
          "type": "object",
          "required": [
            "kind",
            "billId"
          ],
          "properties": {
            "kind": {
              "const": "bill",
              "type": "string"
            },
            "billId": {
              "minLength": 1,
              "description": "Canonical bill id ('119-hr-1234').",
              "type": "string"
            }
          }
        },
        {
          "type": "object",
          "required": [
            "kind",
            "eventId"
          ],
          "properties": {
            "kind": {
              "const": "event",
              "type": "string"
            },
            "eventId": {
              "minLength": 1,
              "description": "Canonical event id from politiclaw_check_upcoming_votes.",
              "type": "string"
            }
          }
        },
        {
          "type": "object",
          "required": [
            "kind",
            "electionDate"
          ],
          "properties": {
            "kind": {
              "const": "election",
              "type": "string"
            },
            "electionDate": {
              "pattern": "^\\d{4}-\\d{2}-\\d{2}$",
              "description": "ISO election date (YYYY-MM-DD).",
              "type": "string"
            }
          }
        }
      ]
    },
    "extraSteps": {
      "description": "Optional user-supplied checklist items appended verbatim in order.",
      "type": "array",
      "items": {
        "minLength": 1,
        "type": "string"
      }
    }
  }
}
```
