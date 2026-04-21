# politiclaw_set_monitoring_cadence

- Label: Set PolitiClaw monitoring cadence
- Group: Preferences and onboarding
- Source file: `packages/politiclaw-plugin/src/tools/preferences.ts`

## Description

Pick how loud PolitiClaw monitoring should be and reconcile the gateway cron jobs to match: 'off' (no monitoring), 'election_proximity' (default — quiet except near elections, plus change-gated rep-vote and hearings watches), 'weekly' (weekly digest + monthly rep report + watches), or 'both' (all jobs). Persists the choice in preferences and calls setup_monitoring so installed jobs outside the chosen set are paused (not deleted — preserves gateway state if the user flips back).

## Parameters

| Name | Required | Type | Description |
| --- | --- | --- | --- |
| `cadence` | yes | `"off" \| "election_proximity" \| "weekly" \| "both"` | How loud PolitiClaw monitoring should be. 'off' installs no jobs. 'election_proximity' adds ramped alerts at 30/14/7/1 days plus rep-vote and hearings watches. 'weekly' adds the weekly digest and monthly rep report instead. 'both' installs all jobs. |

## Raw Schema

```json
{
  "type": "object",
  "required": [
    "cadence"
  ],
  "properties": {
    "cadence": {
      "description": "How loud PolitiClaw monitoring should be. 'off' installs no jobs. 'election_proximity' adds ramped alerts at 30/14/7/1 days plus rep-vote and hearings watches. 'weekly' adds the weekly digest and monthly rep report instead. 'both' installs all jobs.",
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
    }
  }
}
```
