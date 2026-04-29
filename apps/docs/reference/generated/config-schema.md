# Generated Config Schema

This page is generated from `openclaw.plugin.json` plus the explicit runtime source coverage catalog.

| Key | Required | Status | Wired Today | Summary |
| --- | --- | --- | --- | --- |
| `apiKeys.apiDataGov` | yes | `implemented` | yes | REQUIRED. Shared api.data.gov key used by both api.congress.gov and FEC OpenFEC. One key covers both. Free, instant signup at https://api.data.gov/signup/. |
| `apiKeys.geocodio` | no | `optional_upgrade` | yes | OPTIONAL UPGRADE. Reps-by-address via API. Default path uses the zero-key local shapefile pipeline; Geocodio trades disk footprint for API simplicity. Free tier 2500 lookups/day. |
| `apiKeys.openStates` | no | `schema_only` | no | OPTIONAL UPGRADE. State bills and votes with individual member positions. Without a key, state bill lookup is narrative-only via LLM search; state vote positions and state change-detection require this. |
| `apiKeys.legiscan` | no | `schema_only` | no | OPTIONAL UPGRADE. State bills fallback or primary source. Free tier 30,000 queries/month. Covers federal and state in one key if the user prefers unified access. |
| `apiKeys.openSecrets` | no | `schema_only` | no | OPTIONAL UPGRADE. Federal campaign-finance derived analytics such as industry rollups and revolving-door context. Non-commercial use only. Without a key, narrative context falls back to LLM search, but never for dollar amounts. |
| `apiKeys.followTheMoney` | no | `schema_only` | no | OPTIONAL UPGRADE. State-level campaign finance. Without this, state finance data is explicitly not covered. |
| `apiKeys.voteSmart` | no | `schema_only` | no | OPTIONAL UPGRADE. Candidate bios for ballot explanations. Default bios come from LLM search and are tagged as low-confidence narrative; Vote Smart provides structured, verified bios. |
| `apiKeys.democracyWorks` | no | `schema_only` | no | OPTIONAL UPGRADE. Ballot logistics such as dates, deadlines, and polling places. Partner-gated; requires an application. Default uses Google Civic voterInfoQuery (free, less reliable). |
| `apiKeys.cicero` | no | `schema_only` | no | OPTIONAL UPGRADE (paid). Local municipal, county, and school-board representative coverage. This is the only local source; without it, local reps are explicitly not covered. |
| `apiKeys.ballotReady` | no | `schema_only` | no | OPTIONAL UPGRADE (commercial). Structured down-ballot data. Default scope covers federal, statewide, and six secretary-of-state feeds; BallotReady lights up fuller down-ballot coverage. |
| `apiKeys.googleCivic` | no | `optional_upgrade` | yes | OPTIONAL but required for politiclaw_get_my_ballot. Google Cloud API key with the Civic Information API enabled for voterInfoQuery. Distinct from api.data.gov; create it in the Google Cloud console. |

## apiKeys.apiDataGov

REQUIRED. Shared api.data.gov key used by both api.congress.gov and FEC OpenFEC. One key covers both. Free, instant signup at https://api.data.gov/signup/.

- Runtime status: `implemented`
- Required: yes
- Wired today: yes
- Unlocks: `politiclaw_search_bills`, `politiclaw_get_bill_details`, `politiclaw_score_bill`, `politiclaw_check_upcoming_votes`, `politiclaw_ingest_votes`, `politiclaw_research_finance`
- Runtime files: `packages/politiclaw-plugin/src/sources/bills/index.ts`, `packages/politiclaw-plugin/src/sources/votes/index.ts`, `packages/politiclaw-plugin/src/sources/upcomingVotes/index.ts`, `packages/politiclaw-plugin/src/sources/finance/index.ts`
- Notes: One key powers api.congress.gov-backed sources and FEC OpenFEC. Senate roll-call ingest runs through a separate zero-key source (voteview.com).

## apiKeys.geocodio

OPTIONAL UPGRADE. Reps-by-address via API. Default path uses the zero-key local shapefile pipeline; Geocodio trades disk footprint for API simplicity. Free tier 2500 lookups/day.

- Runtime status: `optional_upgrade`
- Required: no
- Wired today: yes
- Unlocks: `politiclaw_get_my_reps`
- Runtime files: `packages/politiclaw-plugin/src/sources/reps/index.ts`, `packages/politiclaw-plugin/src/sources/reps/geocodio.ts`
- Notes: Used ahead of the local shapefile resolver when a key is configured.

## apiKeys.openStates

OPTIONAL UPGRADE. State bills and votes with individual member positions. Without a key, state bill lookup is narrative-only via LLM search; state vote positions and state change-detection require this.

- Runtime status: `schema_only`
- Required: no
- Wired today: no
- Runtime files: `packages/politiclaw-plugin/openclaw.plugin.json`, `packages/politiclaw-plugin/src/storage/context.ts`
- Notes: State legislative coverage is out of scope for the wired runtime today.

## apiKeys.legiscan

OPTIONAL UPGRADE. State bills fallback or primary source. Free tier 30,000 queries/month. Covers federal and state in one key if the user prefers unified access.

- Runtime status: `schema_only`
- Required: no
- Wired today: no
- Runtime files: `packages/politiclaw-plugin/openclaw.plugin.json`, `packages/politiclaw-plugin/src/storage/context.ts`
- Notes: State legislative coverage is out of scope for the wired runtime today.

## apiKeys.openSecrets

OPTIONAL UPGRADE. Federal campaign-finance derived analytics such as industry rollups and revolving-door context. Non-commercial use only. Without a key, narrative context falls back to LLM search, but never for dollar amounts.

- Runtime status: `schema_only`
- Required: no
- Wired today: no
- Runtime files: `packages/politiclaw-plugin/openclaw.plugin.json`, `packages/politiclaw-plugin/src/storage/context.ts`, `packages/politiclaw-plugin/src/tools/researchFinance.ts`
- Notes: The candidate research tool intentionally stops at FEC totals today.

## apiKeys.followTheMoney

OPTIONAL UPGRADE. State-level campaign finance. Without this, state finance data is explicitly not covered.

- Runtime status: `schema_only`
- Required: no
- Wired today: no
- Runtime files: `packages/politiclaw-plugin/openclaw.plugin.json`, `packages/politiclaw-plugin/src/storage/context.ts`
- Notes: No state-finance adapter currently reads this key.

## apiKeys.voteSmart

OPTIONAL UPGRADE. Candidate bios for ballot explanations. Default bios come from LLM search and are tagged as low-confidence narrative; Vote Smart provides structured, verified bios.

- Runtime status: `schema_only`
- Required: no
- Wired today: no
- Runtime files: `packages/politiclaw-plugin/openclaw.plugin.json`, `packages/politiclaw-plugin/src/storage/context.ts`
- Notes: The runtime still routes candidate-bio enrichment through the guarded web-search layer.

## apiKeys.democracyWorks

OPTIONAL UPGRADE. Ballot logistics such as dates, deadlines, and polling places. Partner-gated; requires an application. Default uses Google Civic voterInfoQuery (free, less reliable).

- Runtime status: `schema_only`
- Required: no
- Wired today: no
- Runtime files: `packages/politiclaw-plugin/openclaw.plugin.json`, `packages/politiclaw-plugin/src/storage/context.ts`
- Notes: Ballot logistics currently come from state adapters or Google Civic.

## apiKeys.cicero

OPTIONAL UPGRADE (paid). Local municipal, county, and school-board representative coverage. This is the only local source; without it, local reps are explicitly not covered.

- Runtime status: `schema_only`
- Required: no
- Wired today: no
- Runtime files: `packages/politiclaw-plugin/openclaw.plugin.json`, `packages/politiclaw-plugin/src/storage/context.ts`
- Notes: Municipal, county, and state-legislative representative coverage is not implemented today.

## apiKeys.ballotReady

OPTIONAL UPGRADE (commercial). Structured down-ballot data. Default scope covers federal, statewide, and six secretary-of-state feeds; BallotReady lights up fuller down-ballot coverage.

- Runtime status: `schema_only`
- Required: no
- Wired today: no
- Runtime files: `packages/politiclaw-plugin/openclaw.plugin.json`, `packages/politiclaw-plugin/src/storage/context.ts`
- Notes: Curated down-ballot contest enrichment beyond Google Civic is not wired.

## apiKeys.googleCivic

OPTIONAL but required for politiclaw_get_my_ballot. Google Cloud API key with the Civic Information API enabled for voterInfoQuery. Distinct from api.data.gov; create it in the Google Cloud console.

- Runtime status: `optional_upgrade`
- Required: no
- Wired today: yes
- Unlocks: `politiclaw_get_my_ballot`, `politiclaw_election_brief`
- Runtime files: `packages/politiclaw-plugin/src/sources/ballot/index.ts`, `packages/politiclaw-plugin/src/sources/ballot/googleCivic.ts`
- Notes: Required for every ballot tool. Per-state SoS adapters were scoped out in v1 after an audit found none of the six candidate states publishes a public address-to-ballot JSON feed; revisit when BallotReady or Democracy Works provides self-serve keys. Judicial retention detail and ballot-measure plain-language enrichment are not wired.
