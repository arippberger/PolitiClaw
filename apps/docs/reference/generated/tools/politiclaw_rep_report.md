# politiclaw_rep_report

- Label: Did your delegation represent the stances you declared?
- Group: Representatives and alignment
- Source file: `packages/politiclaw-plugin/src/tools/repReport.ts`

## Description

Canonical accountability surface across your full stored delegation. Recomputes per-issue alignment for every rep (same deterministic logic as politiclaw_score_representative), tags each rep with a 3-band accountability pattern (aligned / mixed / concerning / insufficient data), and returns one combined document with a pattern tally, per-rep sections, congress.gov links for cited bills, and source-tier labels. Requires declared issue stances and stored reps. Intended for periodic digests (see politiclaw.rep_report cron template).

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
