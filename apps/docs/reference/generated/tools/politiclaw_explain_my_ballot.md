# politiclaw_explain_my_ballot

- Label: Explain each contest on your ballot with facts + framing — never a recommendation
- Group: Ballot and election prep
- Source file: `packages/politiclaw-plugin/src/tools/explainBallot.ts`

## Description

Per-contest, non-prescriptive framing of your ballot. For measures, renders deterministic 'A YES vote would…' / 'A NO vote would…' lines drawn from Google Civic's published summary (tier 2 aggregator — verify against official text). For candidate races, explains what the race decides and attaches candidate bios from the tier-5 web-search adapter when wired. Never says 'vote YES/NO'. Always includes the verify-against-official-source disclaimer when any rendered line is LLM-search-derived. Requires declared issue stances, a saved address, and plugins.politiclaw.apiKeys.googleCivic.

## Parameters

| Name | Required | Type | Description |
| --- | --- | --- | --- |
| `refresh` | no | `boolean` | When true, bypass the cached ballot snapshot and re-query voterInfoQuery. |

## Raw Schema

```json
{
  "type": "object",
  "properties": {
    "refresh": {
      "description": "When true, bypass the cached ballot snapshot and re-query voterInfoQuery.",
      "type": "boolean"
    }
  }
}
```
