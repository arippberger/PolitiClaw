# FEC OpenFEC fixtures

Dated 2026-04-19. Real candidate ids have been replaced with synthetic
placeholders to keep this repo free of any hint that it endorses or opposes
a specific federal candidate. Field shapes match the
OpenFEC response schema as of 2026-04-19.

- `fec_candidate_search.json` — `/v1/candidates/search/?q=Example` happy path.
- `fec_candidate_search_empty.json` — `/v1/candidates/search/` with zero results.
- `fec_candidate_totals.json` — `/v1/candidate/{id}/totals/` with two cycles.
