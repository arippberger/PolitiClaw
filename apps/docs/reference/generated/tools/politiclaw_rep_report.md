# politiclaw_rep_report

- Label: Monthly-style representative alignment report for all stored reps
- Group: Representatives and alignment
- Source file: `packages/politiclaw-plugin/src/tools/repReport.ts`

## Description

Recomputes alignment for every representative in the reps table (same logic as politiclaw_score_representative) and returns one combined report with per-rep sections, congress.gov links for cited bills, and source-tier labels. Requires declared issue stances and stored reps. Intended for periodic digests (see politiclaw.rep_report cron template).

## Parameters

| Name | Required | Type | Description |
| --- | --- | --- | --- |
| `includeProcedural` | no | `boolean` | When true, procedural House roll calls are INCLUDED in scoring (same semantics as politiclaw_score_representative). Default is false. |

## Raw Schema

```json
{
  "type": "object",
  "properties": {
    "includeProcedural": {
      "description": "When true, procedural House roll calls are INCLUDED in scoring (same semantics as politiclaw_score_representative). Default is false.",
      "type": "boolean"
    }
  }
}
```
