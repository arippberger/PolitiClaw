# PolitiClaw Plugin

A local-first OpenClaw plugin that turns your agent into a personal political co-pilot. It monitors legislation you care about, tracks how your representatives vote, prepares you for upcoming elections, and drafts outreach — all on your own machine, with no send path and no prescriptive voting recommendations.

Political data stays in a plugin-private SQLite database under the gateway's state directory. It does not write to shared agent memory.

## Install

From the repository root, install the plugin into a running OpenClaw gateway as a linked source checkout:

```bash
openclaw plugins install ./packages/politiclaw-plugin --link
```

Reload the gateway (or restart the OpenClaw app) to pick up the new tools.

## First-run checklist — 10 minutes to your first alert

Run these tool calls through your agent in order. None require hand-editing files or the SQLite database.

1. **Run configuration once.** Call `politiclaw_configure` with your street address. It saves your address, resolves your federal reps, returns the issue-setup flow when stances are missing, and applies your saved monitoring cadence once setup is complete.

2. **Declare at least one issue stance.** Use the `issueStances` input on `politiclaw_configure` during setup, or add/edit one later with `politiclaw_set_issue_stance`. This is what alignment scoring compares bills against.

3. **Re-run configuration whenever something changes.** `politiclaw_configure` is also the front door for refreshing reps, changing monitoring cadence, or updating the saved address.

4. **Wait for the first alert.** The weekly summary cron fires once a week; election-proximity alerts fire more often as an election in your state approaches. If you want a preview of what the next weekly digest will pull from, call `politiclaw_check_upcoming_votes` with a 7-day window — that is the main input the weekly summary composes from. There is no "run the weekly summary now" tool; the digest is cron-driven and assembled via the `politiclaw-summary` skill.

If anything in this path looks wrong, run `politiclaw_doctor` — see [Troubleshooting](#troubleshooting).

## API keys

Configure keys in the gateway under the plugin's `apiKeys` config block. **One key is required; the rest are optional upgrades.**

| Key | Required? | What it unlocks |
| --- | --- | --- |
| `apiDataGov` | **Required** | Federal bills, House and Senate roll-call votes with member positions, and FEC campaign-finance data. One `api.data.gov` key covers both `api.congress.gov` and OpenFEC. Free, instant signup at [api.data.gov/signup](https://api.data.gov/signup/). |
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
