# Getting Started

PolitiClaw lives in this monorepo as an OpenClaw plugin plus a VitePress docs app. The docs site is meant to be read in two passes:

- Start with the guide for setup, verification, configuration, privacy, monitoring, and troubleshooting.
- Use the reference section for exact runtime facts such as tool schemas, config status, cron templates, skills, and storage layout.

## Recommended Reading Order

1. [Installation and Verification](./installation-and-verification)
2. [Configuration](./configuration)
3. [Privacy and Storage](./privacy-and-storage)
4. [Tools Reference](../reference/tools)
5. [Source Coverage](../reference/source-coverage)

## First Successful Run

If you are bringing up a fresh local install, the shortest path is:

1. Install the plugin locally and confirm the workspace builds.
2. Save an address with [`politiclaw_set_preferences`](../reference/generated/tools/politiclaw_set_preferences).
3. Run [`politiclaw_doctor`](../reference/generated/tools/politiclaw_doctor) to catch missing configuration or storage problems early.
4. Load reps with [`politiclaw_get_my_reps`](../reference/generated/tools/politiclaw_get_my_reps).
5. Start issue setup with [`politiclaw_start_onboarding`](../reference/generated/tools/politiclaw_start_onboarding).

From there, most users branch into either bill tracking, ballot prep, or monitoring.

## What To Trust

When a question is about an exact runtime fact, prefer the generated reference pages over prose summaries:

- [Generated Tool Reference](../reference/generated/tools/index)
- [Generated Config Schema](../reference/generated/config-schema)
- [Generated Source Coverage](../reference/generated/source-coverage)
- [Generated Storage Schema](../reference/generated/storage-schema)

That is the key difference between this site and the older planning material: the published reference is derived from the current implementation, not from intent documents.
