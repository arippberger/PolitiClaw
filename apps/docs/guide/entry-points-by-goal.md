# Entry Points by Goal

Use this page when multiple tools can answer a similar need and you want to know which one should be the default front door.

```mermaid
flowchart TD
  start{"What do you want to do?"}
  start -->|"Set up / save stances / save keys"| configure["politiclaw_configure"]
  start -->|"Prepare for an election"| prep["politiclaw_election_brief"]
  start -->|"Manage monitoring"| configureMonitor["politiclaw_configure"]
  start -->|"Research a candidate"| candidate["politiclaw_research_finance<br/>(mode='candidate')"]
  start -->|"Reps and bills"| repsBills["politiclaw_get_my_reps<br/>politiclaw_search_bills<br/>politiclaw_score_*"]

  configure -. "edit one stance later" .-> stance["politiclaw_issue_stances"]
  prep -. "raw ballot snapshot" .-> ballot["politiclaw_get_my_ballot"]
  configureMonitor -. "one-off snapshot" .-> upcoming["politiclaw_check_upcoming_votes"]
  configureMonitor -. "suppress a topic" .-> mute["politiclaw_mutes"]
  candidate -. "incumbent vs challenger" .-> challenger["politiclaw_research_finance<br/>(mode='challengers')"]
  repsBills -. "single bill details" .-> bill["politiclaw_get_bill_details"]
  repsBills -. "combined report" .-> report["politiclaw_rep_report"]
```

## Getting set up

### Default entry point

- [`politiclaw_configure`](../reference/generated/tools/politiclaw_configure)

### Why

It bundles the highest-friction setup work into one flow instead of making users manually discover address saving, rep bootstrap, issue stances, monitoring, and API key persistence in separate steps. Re-running it with just `apiDataGov` (or `optionalApiKeys`) after onboarding is the canonical way to update keys.

### Use the lower-level tools when

- you are editing, listing, or removing a single declared stance later with [`politiclaw_issue_stances`](../reference/generated/tools/politiclaw_issue_stances) (action `set` / `list` / `delete`)

## Ballot and election prep

### Default entry point

- [`politiclaw_election_brief`](../reference/generated/tools/politiclaw_election_brief)

### Why

It is the highest-value answer for most users because it checks prerequisites, pulls ballot context, and combines per-contest framing with representative context in one output.

### Use the lower-level tools when

- you need the raw ballot snapshot and logistics for debugging or plumbing, use [`politiclaw_get_my_ballot`](../reference/generated/tools/politiclaw_get_my_ballot)

## Monitoring

### Default entry point

- [`politiclaw_configure`](../reference/generated/tools/politiclaw_configure)

### Why

It is the cleanest user-facing control. Most users want one place to save setup and choose how loud monitoring should be, not reason about job installation details.

### Use the lower-level tools when

- you want a one-off snapshot instead of ongoing monitoring, use [`politiclaw_check_upcoming_votes`](../reference/generated/tools/politiclaw_check_upcoming_votes)
- you want to suppress a specific topic without changing cadence, use [`politiclaw_mutes`](../reference/generated/tools/politiclaw_mutes) with `action='add'`, `'remove'`, or `'list'`

### See also

- [Recurring Monitoring](./recurring-monitoring) for what the cadence actually produces over time.
- [Examples of Good Alerts](./example-alerts) for the shape of each job's output.

## Candidate and race research

### Default entry point

- [`politiclaw_research_finance`](../reference/generated/tools/politiclaw_research_finance)

### Why

Most user intent starts with a person, not a whole race. Use `mode='candidate'` for a single FEC candidate (with `name` to disambiguate or `candidateId` for full per-cycle totals).

### Use the lower-level modes when

- you want side-by-side incumbent versus challenger finance context for a stored race, call the same tool with `mode='challengers'`

## Reps and bills

### Default entry points

- [`politiclaw_get_my_reps`](../reference/generated/tools/politiclaw_get_my_reps)
- [`politiclaw_score_representative`](../reference/generated/tools/politiclaw_score_representative)
- [`politiclaw_search_bills`](../reference/generated/tools/politiclaw_search_bills)
- [`politiclaw_score_bill`](../reference/generated/tools/politiclaw_score_bill)

### Why

These pair clean discovery questions with alignment questions. They are the strongest core public surface for ongoing civic use.

### Use the lower-level tools when

- you need a single bill's exact source-backed details, use [`politiclaw_get_bill_details`](../reference/generated/tools/politiclaw_get_bill_details)
- you want a combined report across stored reps, use [`politiclaw_rep_report`](../reference/generated/tools/politiclaw_rep_report)

### See also

- [How PolitiClaw Holds Representatives Accountable](./rep-accountability) for how scoring, digests, and draft outreach fit into one loop.
