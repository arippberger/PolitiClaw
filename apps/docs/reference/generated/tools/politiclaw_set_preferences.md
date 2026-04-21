# politiclaw_set_preferences

- Label: Save PolitiClaw preferences
- Group: Preferences and onboarding
- Source file: `packages/politiclaw-plugin/src/tools/preferences.ts`

## Description

Save or update the user's political preferences (address, state, district). Writes to the plugin-private SQLite DB. Use this during onboarding or whenever the user updates their address.

## Parameters

| Name | Required | Type | Description |
| --- | --- | --- | --- |
| `address` | yes | `string` | Street address. Used for representative and ballot lookup. |
| `zip` | no | `string` |  |
| `state` | no | `string` | 2-letter state code (e.g., CA). |
| `district` | no | `string` | Congressional district if known. |

## Raw Schema

```json
{
  "type": "object",
  "required": [
    "address"
  ],
  "properties": {
    "address": {
      "description": "Street address. Used for representative and ballot lookup.",
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
    }
  }
}
```
