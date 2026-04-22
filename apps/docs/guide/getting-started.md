# Getting Started

PolitiClaw lives in this monorepo as an OpenClaw plugin plus a VitePress docs app. The docs site is meant to be read in two passes:

- Start with the guide for setup, verification, configuration, privacy, monitoring, and troubleshooting.
- Use the reference section for exact runtime facts such as tool schemas, config status, cron templates, skills, and storage layout.

## Recommended Reading Order

1. [Installation and Verification](./installation-and-verification)
2. [Configuration](./configuration)
3. [Entry Points by Goal](./entry-points-by-goal)
4. [Privacy and Storage](./privacy-and-storage)
5. [Tools Reference](../reference/tools)
6. [Source Coverage](../reference/source-coverage)

## First Successful Run

If you are bringing up a fresh local install, the shortest path is:

1. Install the plugin locally and confirm the workspace builds.
2. Run [`politiclaw_configure`](../reference/generated/tools/politiclaw_configure) with your address.
3. Run [`politiclaw_doctor`](../reference/generated/tools/politiclaw_doctor) to catch missing configuration or storage problems early.
4. If `politiclaw_configure` returns an issue-setup handoff, follow it to save at least one stance.
5. Re-run [`politiclaw_configure`](../reference/generated/tools/politiclaw_configure) any time you want to refresh reps or change monitoring cadence.

From there, most users branch into either bill tracking, ballot prep, or monitoring. When several tools seem to overlap, use [Entry Points by Goal](./entry-points-by-goal) to find the default front door before jumping into lower-level reference pages.

## What To Trust

When a question is about an exact runtime fact, prefer the generated reference pages over prose summaries:

- [Generated Tool Reference](../reference/generated/tools/index)
- [Generated Config Schema](../reference/generated/config-schema)
- [Generated Source Coverage](../reference/generated/source-coverage)
- [Generated Storage Schema](../reference/generated/storage-schema)

That is the key difference between this site and the older planning material: the published reference is derived from the current implementation, not from intent documents.
