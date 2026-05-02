# Quick Commands

PolitiClaw registers a handful of "quick commands" that bypass the agent entirely. They return canned, deterministic text — useful when you want a fast answer without paying model-token cost or waiting on inference.

These complement the [tools](./tools), they do not replace them. Anything that needs interpretation, drafting, or alignment scoring still flows through the agent.

## When to use a command instead of a tool

Use a quick command when you want:

- a navigation hint (`/politiclaw-help`)
- the next onboarding step and copyable agent prompt (`/politiclaw-setup`)
- a snapshot of saved state without rerunning the doctor tool (`/politiclaw-status`)
- a structured health check (`/politiclaw-doctor`)
- a key inventory and what each unlocks (`/politiclaw-keys`)
- the plugin version and the OpenClaw runtime floor (`/politiclaw-version`)

Use a tool when you want narrative, scoring, drafting, or anything that benefits from the agent's reasoning — `politiclaw_election_brief`, `politiclaw_score_representative`, `politiclaw_draft_outreach`, etc.

## The six commands

### `/politiclaw-help`

Lists the core (Tier 1) tools alongside the other quick commands. Generated from the same tool registry the published reference reads, so the names and one-line summaries stay in sync automatically.

### `/politiclaw-setup`

Shows the next setup step and a copyable prompt for the agent. It does not mutate state or call tools. Before setup, it tells you to ask the agent to call `politiclaw_configure` with your street address. Mid-flow, it reads the onboarding checkpoint and prints the next continue prompt. After setup, it points to `/politiclaw-status`, `/politiclaw-doctor`, and common follow-up tools.

### `/politiclaw-status`

Snapshot of the plugin's saved state: address (state and zip), monitoring mode, accountability setting, action prompting, issue stance count, and how many of the supported API keys are configured. Reads the plugin's private SQLite database directly — no model invocation.

### `/politiclaw-doctor`

Runs the same checks as the [`politiclaw_doctor`](./generated/tools/politiclaw_doctor) tool — schema migrations, SQLite integrity, preferences, accountability mode, API keys, reps cache, cron jobs, and skill overrides — and prints them as a flat list with `[ok]` / `[warn]` / `[fail]` markers and an actionable hint per non-OK check. Use this for a fast, no-cost health check; use the tool for the agent-mediated walkthrough.

### `/politiclaw-keys`

Lists every supported API key with its requirement (required vs optional), current state (set vs not set), and what each unlocks. Use this when you're trying to figure out *why* a particular feature isn't working — if the key is `not set`, the feature won't be wired.

### `/politiclaw-version`

Three lines: the PolitiClaw plugin version (from `package.json`), the plugin API floor (`openclaw.compat.pluginApi` in `package.json`), and the minimum OpenClaw host version (`openclaw.install.minHostVersion`). Use this when filing bug reports or debugging compatibility.

## Where the canned content comes from

Each command's text is generated from existing source-of-truth metadata so it can't drift from the rest of the docs:

- `/politiclaw-help` reads `REGISTERED_POLITICLAW_TOOL_DOCS` and `TOOL_AUDIT_ENTRIES` (the same tier table that drives `apps/docs/maintainers/tool-surface.md`).
- `/politiclaw-setup`, `/politiclaw-status`, and `/politiclaw-doctor` read the live SQLite database via the plugin's storage helpers, plus `getPluginConfig()` for the API key state where needed.
- `/politiclaw-keys` and the doctor's API-key check read a single `API_KEY_FLAGS` constant exported from `src/domain/doctor/checks.ts`.
- `/politiclaw-version` reads the plugin's own `package.json` at runtime.
