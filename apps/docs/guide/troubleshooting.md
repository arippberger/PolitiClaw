# Troubleshooting

## Start With Doctor

When the runtime looks wrong, begin with `/politiclaw-doctor`. It checks storage, schema version, preferences, accountability mode, key presence, cached reps, cron job status, and skill overrides in one place.

## Plugin install fails from a local checkout

End users should install the published package — `openclaw plugins install @politiclaw/politiclaw`. If you are working in this workspace and want a local-source install, the `--link` flag is required so the gateway reads from your checkout:

```bash
openclaw plugins install ./packages/politiclaw-plugin --link
```

For both paths, see [Installation and Verification](./installation-and-verification).

## Bill, Vote, Or Finance Tools Are Unavailable

Make sure `plugins.entries.politiclaw.config.apiKeys.apiDataGov` is set. That is the live key for the current federal bill, House roll-call vote, committee schedule, and FEC finance integrations. (Senate roll-call votes ingest through voteview.com without a key.)

For how to save a key without editing gateway config by hand, see [API Keys → How to set keys](./api-keys#how-to-set-keys). Use the generated config and coverage pages when in doubt:

- [Generated Config Schema](../reference/generated/config-schema)
- [Generated Source Coverage](../reference/generated/source-coverage)

## Ballot Tools Say Google Civic Is Missing

Set `plugins.entries.politiclaw.config.apiKeys.googleCivic`. It is required for every ballot lookup today. See [API Keys → `googleCivic`](./api-keys#googlecivic) for how to obtain and save it.

## Representative Lookup Falls Back Or Fails

If you are using the zero-key path, run `/politiclaw-setup` and ask your agent to call [`politiclaw_configure`](../reference/generated/tools/politiclaw_configure) with your address. If you prefer the API path, add `plugins.entries.politiclaw.config.apiKeys.geocodio` (see [API Keys → `geocodio`](./api-keys#geocodio)).

## Plugin Installed But Tool Unavailable

If OpenClaw says `politiclaw_configure` is unavailable, remember that it is an agent tool, not a shell command. Restart the OpenClaw gateway, verify PolitiClaw is enabled in the plugin registry, then run `/politiclaw-version`.

If `/politiclaw-version` works but the agent still cannot see the tool, run `/politiclaw-doctor`. A packaged install that is missing migrations or dashboard assets should now report a storage/package diagnostic instead of failing generically.

## Gateway Restarted During Key Save

Saving API keys intentionally restarts the gateway so provider adapters pick up the new config. Reconnect, run `/politiclaw-setup`, then continue with the prompt it prints. The setup checkpoint stores only the next stage and saved key names; API key values and address text are not duplicated there.

## Candidate Bio Or Ballot Narrative Looks Thin

That can be expected today. The guarded web-search adapter shape exists, but the production transport is not wired, so some narrative enrichment paths return unavailable. The generated source coverage page shows that status explicitly.

## The docs site will not start

Make sure dependencies are installed from the workspace root, then run:

```bash
npm run docs:dev
```

If `vitepress` is missing, re-run `npm install` from the repository root so the docs workspace dependencies are installed.

## docs:check Fails

The docs checker currently fails for three main reasons:

- **Generated reference artifacts are stale.** Most common after adding, removing, or renaming a tool, cron template, skill, source-coverage entry, or migration. Fix: `npm run docs:generate`, then re-run the check.
- **A hand-written page mentions a hidden planning path.** Triggered when a published page contains a path or identifier reserved for unpublished design notes. Fix: remove or replace the reference with a link to a generated page or a published guide.
- **A hand-written page presents a declared-only integration as if it were live.** Triggered when a published page describes a provider that the source coverage catalog marks as `schema_only` or `transport_pending`. Fix: rewrite the claim to match the catalog, or wait until the integration moves to `implemented` or `optional_upgrade`.

`npm run docs:check` reports the exact file path for each failure.
