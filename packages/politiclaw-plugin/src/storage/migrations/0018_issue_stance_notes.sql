-- Add free-text nuance fields to declared issue stances.
--
-- `note` carries a short paraphrase of the user's specific concern within
-- the issue bucket (e.g. "BWCA wilderness federal protections" under the
-- `public-lands-and-natural-resources` slug). `source_text` preserves the
-- verbatim user phrasing so letters and call scripts can quote it.
--
-- Bill matching is unchanged: keyword expansion in scoring/alignment.ts
-- still runs on the slug only, keeping match behavior deterministic.

ALTER TABLE issue_stances ADD COLUMN note TEXT;
ALTER TABLE issue_stances ADD COLUMN source_text TEXT;
