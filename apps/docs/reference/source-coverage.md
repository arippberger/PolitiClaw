# Source Coverage

This page is the single canonical surface for what PolitiClaw actually covers today. The per-provider matrix lives on the [generated source coverage page](./generated/source-coverage); this page indexes coverage by user goal and names the blind spots directly.

## Coverage by user goal

### Bills and votes

Federal bills are wired through `api.congress.gov` via the shared `apiDataGov` key, and the scoring path maps bills to declared issue stances. Roll-call vote coverage is House-only today. Senate vote ingest is not wired, so rep scoring, vote alerts, and upcoming-vote snapshots reflect House activity only.

### Representatives

`politiclaw_get_my_reps` resolves your US House member and both US Senators, either through the zero-key local shapefile pipeline or the optional Geocodio upgrade. Current rep coverage stops at US House and US Senate. Municipal, county, and state-legislative offices are not resolved.

### Ballots and elections

Ballot and election logistics come from Google Civic's `voterInfoQuery`, gated on the optional `googleCivic` key. Ballots come from Google Civic only, with generic contest shape. Judicial retention detail and ballot-measure plain-language enrichment are not wired.

### Candidate research

`politiclaw_research_candidate` reads FEC OpenFEC through the shared `apiDataGov` key for candidate and committee finance totals. Deeper enrichment — donor industries, revolving-door context, state-level finance — is not wired; see the generated matrix for the full status of optional finance providers.

## What is not covered today

- **Senate votes**: Roll-call vote coverage is House-only today. Senate vote ingest is not wired, so rep scoring, vote alerts, and upcoming-vote snapshots reflect House activity only.
- **State legislatures**: Current coverage is federal only. State bills, state roll-call votes, and state legislators are out of scope for the wired runtime.
- **Local representatives**: Current rep coverage stops at US House and US Senate. Municipal, county, and state-legislative offices are not resolved.
- **Down-ballot depth**: Ballots come from Google Civic only, with generic contest shape. Judicial retention detail and ballot-measure plain-language enrichment are not wired.

## Per-provider matrix

When you need the exact provider status (`implemented`, `optional_upgrade`, `transport_pending`, `schema_only`), config keys, and runtime file paths, use the generated pages:

- [Generated Source Coverage](./generated/source-coverage)
- [Generated Source Coverage JSON](./generated/source-coverage.json)

PolitiClaw currently ships a broader config schema than the runtime implementation. The generated matrix is the source of truth for which providers are actually wired.
