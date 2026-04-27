# politiclaw_score_representative

- Label: Did this representative represent the stances you declared?
- Group: Representatives and alignment
- Source file: `packages/politiclaw-plugin/src/tools/repScoring.ts`

## Description

Measure the gap between a rep's actual federal voting record and the stances the user declared — per issue — so the user can see where this rep represents them and where they don't. Returns a 3-band pattern label (aligned / mixed / concerning), or 'insufficient data' when confidence is too low to classify. Computation is deterministic (no LLM); direction comes exclusively from the user's explicit stance signals on bills, so the rep's record is counted, not narrated. Confidence below the 0.4 floor renders as "insufficient data". Procedural motions are excluded by default; pass includeProcedural=true for the raw tally. House votes come from api.congress.gov (tier 1) and Senate votes come from voteview.com (tier 2, zero-key); a senator will only show "insufficient data" if politiclaw_ingest_votes has not been run for the Senate yet.

## Parameters

| Name | Required | Type | Description |
| --- | --- | --- | --- |
| `repId` | yes | `string` | Stable rep id (bioguide when available). Call politiclaw_get_my_reps first to look it up. |
| `includeProcedural` | no | `boolean` | When true, procedural roll calls (motions-to-adjourn, previous-question, etc.) are INCLUDED in the tally. Default is false. |

## Raw Schema

```json
{
  "type": "object",
  "required": [
    "repId"
  ],
  "properties": {
    "repId": {
      "minLength": 1,
      "description": "Stable rep id (bioguide when available). Call politiclaw_get_my_reps first to look it up.",
      "type": "string"
    },
    "includeProcedural": {
      "description": "When true, procedural roll calls (motions-to-adjourn, previous-question, etc.) are INCLUDED in the tally. Default is false.",
      "type": "boolean"
    }
  }
}
```
