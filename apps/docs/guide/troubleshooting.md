# Troubleshooting

## Start With Doctor

When the runtime looks wrong, begin with [`politiclaw_doctor`](../reference/generated/tools/politiclaw_doctor). It checks storage, schema version, preferences, key presence, cached reps, and monitoring status in one place.

## The plugin does not install from the repo root

```bash
openclaw plugins install ./packages/politiclaw-plugin --link
```

## Bill, Vote, Or Finance Tools Are Unavailable

Make sure `plugins.entries.politiclaw.config.apiKeys.apiDataGov` is set. That is the live key for the current federal bill, House roll-call vote, committee schedule, and FEC finance integrations. (Senate roll-call votes ingest through voteview.com without a key.)

For how to save a key without editing gateway config by hand, see [API Keys → How to set keys](./api-keys#how-to-set-keys). Use the generated config and coverage pages when in doubt:

- [Generated Config Schema](../reference/generated/config-schema)
- [Generated Source Coverage](../reference/generated/source-coverage)

## Ballot Tools Say Google Civic Is Missing

Set `plugins.entries.politiclaw.config.apiKeys.googleCivic`. It is required for every ballot lookup today. See [API Keys → `googleCivic`](./api-keys#googlecivic) for how to obtain and save it.

## Representative Lookup Falls Back Or Fails

If you are using the zero-key path, run [`politiclaw_configure`](../reference/generated/tools/politiclaw_configure) once with your address and retry. If you prefer the API path, add `plugins.entries.politiclaw.config.apiKeys.geocodio` (see [API Keys → `geocodio`](./api-keys#geocodio)).

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
