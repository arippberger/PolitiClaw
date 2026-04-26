# PolitiClaw Plugin

A local-first OpenClaw plugin that turns your agent into a civic copilot that **holds your representatives accountable to the values you declare.** It learns the stances you care about, watches federal legislation and elections on your behalf, flags when your reps' votes and actions align — or don't — with those stances, and drafts letters you send yourself. All on your own machine; no send path, no prescriptive voting recommendations, no stance it invented for you.

Political data stays in a plugin-private SQLite database under the gateway's state directory. It does not write to shared agent memory.

## Install

Install the plugin into a running OpenClaw gateway:

```bash
openclaw plugins install @politiclaw/politiclaw
```

Reload the gateway (or restart the OpenClaw app) to pick up the new tools.

Working on the plugin from a local checkout instead? See [Development](#development).

## First-run checklist — 10 minutes to your first alert

Run these tool calls through your agent in order. None require hand-editing files or the SQLite database.

1. **Run configuration once.** Call `politiclaw_configure` with your street address. It saves your address, resolves your federal reps, returns the issue-setup flow when stances are missing, and applies your saved monitoring cadence once setup is complete.

2. **Declare the stances you want to measure your reps against.** Use the `issueStances` input on `politiclaw_configure` during setup, or add/edit one later with `politiclaw_set_issue_stance`. These are the baseline PolitiClaw uses for every accountability score — no score exists without them.

3. **Re-run configuration whenever something changes.** `politiclaw_configure` is also the front door for refreshing reps, changing monitoring cadence, or updating the saved address.

4. **Wait for the first alert.** The weekly summary cron fires once a week; election-proximity alerts fire more often as an election in your state approaches. If you want a preview of what the next weekly digest will pull from, call `politiclaw_check_upcoming_votes` with a 7-day window — that is the main input the weekly summary composes from. There is no "run the weekly summary now" tool; the digest is cron-driven and assembled via the `politiclaw-summary` skill.

If anything in this path looks wrong, run `politiclaw_doctor` — see [Troubleshooting](#troubleshooting).

## API keys

**The fastest path: paste the key into chat.** Run `politiclaw_configure`. When the api.data.gov key is missing, the agent walks you through signup and asks you to paste the key (and any optional upgrade keys you have) back into chat. The plugin saves them via `politiclaw_set_api_keys`, which writes through the OpenClaw gateway's `config.patch` method (validated, audited, optimistic concurrency). The gateway then restarts itself once to pick up the new values — reconnect after the restart and the keys are live.

`politiclaw_set_api_keys` is also callable on its own ("save my Geocodio key as `xyz`") for one-off updates after onboarding.

You can still edit `~/.openclaw/openclaw.json` by hand under `plugins.politiclaw.apiKeys.*` if you prefer; both paths land in the same file.

**One key is required; the rest are optional upgrades.**

| Key | Required? | What it unlocks |
| --- | --- | --- |
| `apiDataGov` | **Required** | Federal bills, House roll-call votes with member positions, committee schedules, and FEC campaign-finance data. One `api.data.gov` key covers both `api.congress.gov` and OpenFEC. Senate roll-call votes ingest separately through voteview.com (zero-key, no signup). Free, instant signup at [api.data.gov/signup](https://api.data.gov/signup/). |
| `geocodio` | Optional | Reps-by-address via API. Without it, the plugin uses a zero-key local shapefile pipeline — Geocodio trades disk footprint for API simplicity. |
| `openStates` | Optional | State bills and votes with individual member positions. Without it, state bill lookup is narrative-only via LLM search; state vote positions and state change-detection are not available. |
| `legiscan` | Optional | Alternate state bills source. Free tier covers 30,000 queries/month and can substitute for `openStates`. |
| `openSecrets` | Optional | Federal campaign-finance analytics (industry rollups, revolving-door context). Non-commercial use only. Dollar amounts never fall back to LLM search; only narrative context does. |
| `followTheMoney` | Optional | State-level campaign finance. Without it, state finance is not covered. |
| `voteSmart` | Optional | Structured candidate bios for ballot explanations. Default bios come from LLM search tagged as low-confidence. |
| `democracyWorks` | Optional | Ballot logistics (dates, deadlines, polling places). Partner-gated — requires an application. Default uses Google Civic `voterInfoQuery`. |
| `cicero` | Optional (paid) | Local municipal, county, and school-board reps. This is the only local source; without it, local reps are explicitly out of scope. |
| `ballotReady` | Optional (commercial) | Fuller down-ballot coverage. Default scope is federal, statewide, and six state secretary-of-state feeds (CA, WA, CO, OH, FL, MI). |
| `googleCivic` | Optional but required for `politiclaw_get_my_ballot` | Google Cloud API key with the Civic Information API enabled. Distinct from `api.data.gov`. |

To validate that your keys are wired up correctly, run `politiclaw_doctor` — it checks every key the plugin recognizes and reports which tools each missing key gates.

## Override recipes

Agent behavior for PolitiClaw is driven by plain-markdown skills under `skills/`. You can edit these in place to retune the plugin's voice, guardrails, or ordering without rebuilding the plugin — the gateway re-reads them on reload.

Current skills:

- `politiclaw-onboarding` — first-run flow that helps `politiclaw_configure` collect issue stances in a conversational or quiz-style handoff.
- `politiclaw-monitoring` — how the agent interprets change-detection results, alignment scores, and election-proximity alerts.
- `politiclaw-ballot` — how the agent explains ballot items without prescribing a vote.
- `politiclaw-outreach` — how the agent drafts letters (user-authored, never auto-sent).
- `politiclaw-summary` — format and scope of the weekly digest.

Typical edits: tightening or relaxing the anti-prescription guardrails, adding project-specific stance vocabulary, or changing the default tone of drafted letters. Changes to skills do not require `npm run build`.

## Dashboard

The plugin registers a local-only dashboard at `/politiclaw` on the gateway's HTTP surface. It shows your preferences, reps and alignment scores, installed monitoring jobs, upcoming election, recent alerts, recent drafted letters, and recent bill-linked roll-call votes — all driven by the plugin's private SQLite DB.

The dashboard is also editable:

- **Preferences form** — save address, ZIP, state, district, or monitoring cadence without going through the agent.
- **Pause all / Resume all** — bulk-toggle every PolitiClaw cron job on the gateway.
- **Quick-vote buttons** — record agree/disagree/skip signals on recent bill-linked votes. Each click is stored as a stance signal that nudges your rep alignment scores.
- **Request re-draft** — flag a past letter for re-drafting. The next agent session picks up the flag and drafts a fresh version; the browser does not invoke tools directly.

Because the dashboard is registered with `auth: "plugin"`, the gateway adds no auth layer. POST requests are protected by a double-submit CSRF token (`pc_csrf` cookie paired with an `X-PolitiClaw-CSRF` header) and bodies are bounded to 256 KB. Exposure is intended to be local-only; operators who expose the gateway off-host must front the dashboard themselves.

## Troubleshooting

Run `politiclaw_doctor` first. It checks, in one pass:

- Schema migrations are up to date.
- The SQLite database passes integrity checks.
- Preferences are populated (address, zip, state).
- Every recognized API key is classified as required / optional / missing, with the gated tools listed.
- The reps cache has been populated and isn't stale.
- Every monitoring cron job the plugin expects to own is installed.

Each check returns `ok`, `warn`, or `fail` with an actionable hint for every non-ok result. The tool is read-only — it never mutates state.

Cross-machine caveat: the doctor runs inside the OpenClaw gateway process. If your gateway runs on a different host than where you installed the plugin source, gateway-side errors (missing cron adapter, unreadable state directory) will surface as `fail` in the report and have to be fixed on the gateway host.

## Development

### Install from a local checkout

From the workspace root:

```bash
openclaw plugins install ./packages/politiclaw-plugin --link
```

The `--link` install reads from the source path, so edits land without reinstalling.

### Build and test

From this package directory:

```bash
npm run build
npm run typecheck
npm run test
```

From the workspace root:

```bash
npm run dev:plugin
```
