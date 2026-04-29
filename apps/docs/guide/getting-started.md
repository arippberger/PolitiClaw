# Getting Started

PolitiClaw is a local-first civic copilot that holds your representatives accountable to the values you declare. Once you've told it the stances you care about, it watches federal legislation and federal roll-call votes (House and Senate) for you and flags when your reps' actions align — or don't — with those stances. Outreach is draft-only; PolitiClaw never speaks on your behalf.

It lives in this monorepo as an OpenClaw plugin plus a VitePress docs app. The docs site is meant to be read in two passes:

- Start with the guide for setup, verification, configuration, privacy, monitoring, and troubleshooting.
- Use the reference section for exact runtime facts such as tool schemas, config status, cron templates, skills, and storage layout.

## Recommended Reading Order

1. [Installation and Verification](./installation-and-verification)
2. [API Keys](./api-keys)
3. [Configuration](./configuration)
4. [Entry Points by Goal](./entry-points-by-goal)
5. [Privacy and Storage](./privacy-and-storage)
6. [Tools Reference](../reference/tools)
7. [Source Coverage](../reference/source-coverage)

## First Successful Run

The shortest path from install to a real answer:

1. Install the plugin — `openclaw plugins install @politiclaw/politiclaw` for the npm path, or follow the local-checkout path in [Installation and Verification](./installation-and-verification) if you are working in this workspace.
2. Run [`politiclaw_configure`](../reference/generated/tools/politiclaw_configure) with your address.
3. Run [`politiclaw_doctor`](../reference/generated/tools/politiclaw_doctor) to catch missing configuration or storage problems early.
4. If `politiclaw_configure` returns an issue-setup handoff, follow it to save at least one stance.
5. Re-run [`politiclaw_configure`](../reference/generated/tools/politiclaw_configure) any time you want to refresh reps or change monitoring cadence.

From there, most users branch into either bill tracking, ballot prep, or monitoring. When several tools seem to overlap, use [Entry Points by Goal](./entry-points-by-goal) to find the default front door before jumping into lower-level reference pages.

For everything related to provider keys — which key unlocks which tool, how to obtain each, how to save them with [`politiclaw_configure`](../reference/generated/tools/politiclaw_configure) or the configure flow, and what the gateway-restart implication is — see [API Keys](./api-keys).

## What To Expect Over Time

After setup, PolitiClaw's recurring monitoring jobs run on your gateway and stay silent on empty windows. For a walk-through of what shows up in your session and when, read [Recurring Monitoring](./recurring-monitoring). For a feel for the shape of a good alert, read [Examples of Good Alerts](./example-alerts). For how scoring and accountability fit together, read [How PolitiClaw Holds Representatives Accountable](./rep-accountability).

## What To Trust

When a question is about an exact runtime fact, prefer the generated reference pages over prose summaries:

- [Generated Tool Reference](../reference/generated/tools/index)
- [Generated Config Schema](../reference/generated/config-schema)
- [Generated Source Coverage](../reference/generated/source-coverage)
- [Generated Storage Schema](../reference/generated/storage-schema)

That is the key difference between this site and the older planning material: the published reference is derived from the current implementation, not from intent documents.
