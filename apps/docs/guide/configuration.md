# Configuration

PolitiClaw exposes its settings through the plugin config schema, with one required API key and several optional upgrades.

## Required key

`plugins.politiclaw.apiKeys.apiDataGov`

- Powers Congress.gov-backed bill and vote data.
- Powers FEC OpenFEC candidate finance lookups.
- One key covers both services.

## Optional keys

`plugins.politiclaw.apiKeys.googleCivic`

- Required for `politiclaw_get_my_ballot`.
- Used for personalized ballot lookup.

`plugins.politiclaw.apiKeys.geocodio`

- Optional address-to-district lookup upgrade.
- Useful when you prefer API resolution instead of a local shapefile pipeline.

`plugins.politiclaw.apiKeys.openStates`

- Structured state-level bills and vote positions when available.

`plugins.politiclaw.apiKeys.legiscan`

- Alternative source for state legislative data.

`plugins.politiclaw.apiKeys.openSecrets`

- Optional federal finance enrichment where the plugin supports it.

`plugins.politiclaw.apiKeys.followTheMoney`

- Optional state campaign-finance coverage.

`plugins.politiclaw.apiKeys.voteSmart`

- Optional structured candidate biography support.

`plugins.politiclaw.apiKeys.democracyWorks`

- Optional ballot logistics upgrade.

`plugins.politiclaw.apiKeys.cicero`

- Optional paid local representative coverage.

`plugins.politiclaw.apiKeys.ballotReady`

- Optional commercial down-ballot data coverage.

## Configuration approach

Keep the required key in place first, then add optional providers only for the workflows you actually plan to use. This keeps the plugin simpler to reason about and makes missing-feature troubleshooting much clearer.
