# Troubleshooting

## Start With Doctor

When the runtime looks wrong, begin with [`politiclaw_doctor`](../reference/generated/tools/politiclaw_doctor). It checks storage, schema version, preferences, key presence, cached reps, and monitoring status in one place.

## The plugin does not install from the repo root

```bash
openclaw plugins install ./packages/politiclaw-plugin --link
```

## Bill, Vote, Or Finance Tools Are Unavailable

Make sure `plugins.politiclaw.apiKeys.apiDataGov` is set. That is the live key for the current federal bill, House vote, committee schedule, and FEC finance integrations.

Use the generated config and coverage pages when in doubt:

- [Generated Config Schema](../reference/generated/config-schema)
- [Generated Source Coverage](../reference/generated/source-coverage)

## Ballot Tools Say Google Civic Is Missing

Set `plugins.politiclaw.apiKeys.googleCivic`. It is required for every ballot lookup today.

## Representative Lookup Falls Back Or Fails

If you are using the zero-key path, run [`politiclaw_configure`](../reference/generated/tools/politiclaw_configure) once with your address and retry. If you prefer the API path, add `plugins.politiclaw.apiKeys.geocodio`.

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

- Generated reference artifacts are stale and need `npm run docs:generate`.
- A hand-written page mentions a hidden planning path.
- A hand-written page presents a declared-only integration as if it were live.

`npm run docs:check` reports the exact file path for each failure.
