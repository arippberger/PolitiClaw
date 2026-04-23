# Generated Source Coverage

This page is generated from the explicit source coverage catalog.

## Status Legend

- `implemented`: wired into the current runtime with no extra integration work required.
- `optional_upgrade`: wired today, but only active when the user provides a key.
- `schema_only`: declared in the config schema, but not wired into runtime logic yet.
- `transport_pending`: the adapter shape exists, but the production transport is not wired.

| Provider | Status | Config Key | Required | Summary |
| --- | --- | --- | --- | --- |
| api.data.gov | `implemented` | `apiKeys.apiDataGov` | yes | Required for the current federal bill, House vote, committee schedule, and FEC finance integrations. |
| Local shapefile pipeline | `implemented` | n/a | no | Zero-key default for federal reps-by-address resolution after the cache is primed locally. |
| Geocodio | `optional_upgrade` | `apiKeys.geocodio` | no | Optional API-backed upgrade for faster reps-by-address lookup. |
| Voteview (voteview.com) | `implemented` | n/a | no | Zero-key tier-2 source for Senate roll-call votes. api.congress.gov has no /senate-vote endpoint, so this fills the gap. |
| Google Civic voterInfoQuery | `optional_upgrade` | `apiKeys.googleCivic` | no | Key-gated ballot and election-logistics provider — the only ballot source the plugin wires today. |
| Candidate and measure bio web search | `transport_pending` | n/a | no | The guarded adapter shape exists, but the production transport is not wired, so live calls return unavailable. |
| Open States | `schema_only` | `apiKeys.openStates` | no | Declared in the plugin config schema but not wired into the current runtime. |
| LegiScan | `schema_only` | `apiKeys.legiscan` | no | Declared in the plugin config schema but not wired into the current runtime. |
| OpenSecrets | `schema_only` | `apiKeys.openSecrets` | no | Declared in the plugin config schema but not wired into the current runtime. |
| FollowTheMoney | `schema_only` | `apiKeys.followTheMoney` | no | Declared in the plugin config schema but not wired into the current runtime. |
| Vote Smart | `schema_only` | `apiKeys.voteSmart` | no | Declared in the plugin config schema but not wired into the current runtime. |
| Democracy Works | `schema_only` | `apiKeys.democracyWorks` | no | Declared in the plugin config schema but not wired into the current runtime. |
| Cicero | `schema_only` | `apiKeys.cicero` | no | Declared in the plugin config schema but not wired into the current runtime. |
| BallotReady | `schema_only` | `apiKeys.ballotReady` | no | Declared in the plugin config schema but not wired into the current runtime. |

## Provider Details

### api.data.gov

- Status: `implemented`
- Required: yes
- Config key: `apiKeys.apiDataGov`
- Summary: Required for the current federal bill, House vote, committee schedule, and FEC finance integrations.
- Notes: One key powers api.congress.gov-backed sources and FEC OpenFEC. Senate roll-call ingest runs through a separate zero-key source (voteview.com).
- Tools: `politiclaw_search_bills`, `politiclaw_get_bill_details`, `politiclaw_score_bill`, `politiclaw_check_upcoming_votes`, `politiclaw_ingest_votes`, `politiclaw_research_candidate`, `politiclaw_research_challengers`
- Runtime files: `packages/politiclaw-plugin/src/sources/bills/index.ts`, `packages/politiclaw-plugin/src/sources/votes/index.ts`, `packages/politiclaw-plugin/src/sources/upcomingVotes/index.ts`, `packages/politiclaw-plugin/src/sources/finance/index.ts`

### Local shapefile pipeline

- Status: `implemented`
- Required: no
- Summary: Zero-key default for federal reps-by-address resolution after the cache is primed locally.
- Notes: Uses Census geocoding, cached district polygons, and the bundled legislator resolver. The cache can be primed automatically during configuration or rep lookup.
- Tools: `politiclaw_configure`, `politiclaw_get_my_reps`
- Runtime files: `packages/politiclaw-plugin/src/sources/reps/localShapefiles.ts`, `packages/politiclaw-plugin/src/sources/reps/shapefileCache.ts`, `packages/politiclaw-plugin/src/tools/configure.ts`

### Geocodio

- Status: `optional_upgrade`
- Required: no
- Config key: `apiKeys.geocodio`
- Summary: Optional API-backed upgrade for faster reps-by-address lookup.
- Notes: Used ahead of the local shapefile resolver when a key is configured.
- Tools: `politiclaw_get_my_reps`
- Runtime files: `packages/politiclaw-plugin/src/sources/reps/index.ts`, `packages/politiclaw-plugin/src/sources/reps/geocodio.ts`

### Voteview (voteview.com)

- Status: `implemented`
- Required: no
- Summary: Zero-key tier-2 source for Senate roll-call votes. api.congress.gov has no /senate-vote endpoint, so this fills the gap.
- Notes: Undocumented web-app API. The adapter tolerates a small error-envelope rate on /api/download, derives session from vote date, and rejects presidential-nomination ids (PN*) from bill linkage so confirmation votes drop out of bill-keyed scoring.
- Tools: `politiclaw_ingest_votes`, `politiclaw_score_representative`
- Runtime files: `packages/politiclaw-plugin/src/sources/votes/voteview.ts`, `packages/politiclaw-plugin/src/sources/votes/voteviewClient.ts`, `packages/politiclaw-plugin/src/sources/votes/billNumberParser.ts`, `packages/politiclaw-plugin/src/sources/votes/senateProcedural.ts`

### Google Civic voterInfoQuery

- Status: `optional_upgrade`
- Required: no
- Config key: `apiKeys.googleCivic`
- Summary: Key-gated ballot and election-logistics provider — the only ballot source the plugin wires today.
- Notes: Required for every ballot tool. Per-state SoS adapters were scoped out in v1 after an audit found none of the six candidate states publishes a public address-to-ballot JSON feed; revisit when BallotReady or Democracy Works provides self-serve keys.
- Tools: `politiclaw_get_my_ballot`, `politiclaw_explain_my_ballot`, `politiclaw_prepare_me_for_my_next_election`
- Runtime files: `packages/politiclaw-plugin/src/sources/ballot/index.ts`, `packages/politiclaw-plugin/src/sources/ballot/googleCivic.ts`

### Candidate and measure bio web search

- Status: `transport_pending`
- Required: no
- Summary: The guarded adapter shape exists, but the production transport is not wired, so live calls return unavailable.
- Notes: Tests can inject a fetcher today. Production use still depends on the host skill layer for narrative lookup.
- Tools: `politiclaw_research_candidate`, `politiclaw_prepare_me_for_my_next_election`, `politiclaw_explain_my_ballot`
- Runtime files: `packages/politiclaw-plugin/src/sources/webSearch/index.ts`, `packages/politiclaw-plugin/src/sources/webSearch/bios.ts`

### Open States

- Status: `schema_only`
- Required: no
- Config key: `apiKeys.openStates`
- Summary: Declared in the plugin config schema but not wired into the current runtime.
- Notes: No Open States resolver or tool path currently imports this key.
- Runtime files: `packages/politiclaw-plugin/openclaw.plugin.json`, `packages/politiclaw-plugin/src/storage/context.ts`

### LegiScan

- Status: `schema_only`
- Required: no
- Config key: `apiKeys.legiscan`
- Summary: Declared in the plugin config schema but not wired into the current runtime.
- Notes: No LegiScan adapter or tool path currently imports this key.
- Runtime files: `packages/politiclaw-plugin/openclaw.plugin.json`, `packages/politiclaw-plugin/src/storage/context.ts`

### OpenSecrets

- Status: `schema_only`
- Required: no
- Config key: `apiKeys.openSecrets`
- Summary: Declared in the plugin config schema but not wired into the current runtime.
- Notes: The candidate research tool intentionally stops at FEC totals today.
- Runtime files: `packages/politiclaw-plugin/openclaw.plugin.json`, `packages/politiclaw-plugin/src/storage/context.ts`, `packages/politiclaw-plugin/src/tools/researchCandidate.ts`

### FollowTheMoney

- Status: `schema_only`
- Required: no
- Config key: `apiKeys.followTheMoney`
- Summary: Declared in the plugin config schema but not wired into the current runtime.
- Notes: No state-finance adapter currently reads this key.
- Runtime files: `packages/politiclaw-plugin/openclaw.plugin.json`, `packages/politiclaw-plugin/src/storage/context.ts`

### Vote Smart

- Status: `schema_only`
- Required: no
- Config key: `apiKeys.voteSmart`
- Summary: Declared in the plugin config schema but not wired into the current runtime.
- Notes: The runtime still routes candidate-bio enrichment through the guarded web-search layer.
- Runtime files: `packages/politiclaw-plugin/openclaw.plugin.json`, `packages/politiclaw-plugin/src/storage/context.ts`

### Democracy Works

- Status: `schema_only`
- Required: no
- Config key: `apiKeys.democracyWorks`
- Summary: Declared in the plugin config schema but not wired into the current runtime.
- Notes: Ballot logistics currently come from state adapters or Google Civic.
- Runtime files: `packages/politiclaw-plugin/openclaw.plugin.json`, `packages/politiclaw-plugin/src/storage/context.ts`

### Cicero

- Status: `schema_only`
- Required: no
- Config key: `apiKeys.cicero`
- Summary: Declared in the plugin config schema but not wired into the current runtime.
- Notes: Local and municipal representative coverage is not implemented today.
- Runtime files: `packages/politiclaw-plugin/openclaw.plugin.json`, `packages/politiclaw-plugin/src/storage/context.ts`

### BallotReady

- Status: `schema_only`
- Required: no
- Config key: `apiKeys.ballotReady`
- Summary: Declared in the plugin config schema but not wired into the current runtime.
- Notes: Down-ballot commercial coverage is not integrated today.
- Runtime files: `packages/politiclaw-plugin/openclaw.plugin.json`, `packages/politiclaw-plugin/src/storage/context.ts`
