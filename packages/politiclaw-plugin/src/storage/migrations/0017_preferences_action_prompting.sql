-- User-configurable action prompting switch.
--
-- 'on' (default): monitoring runs surface action packages as offers in
--                 the "You might want to act on" section and the
--                 dashboard's Open actions card.
-- 'off':          auto-offers suppressed. Explicit tool calls —
--                 politiclaw_draft_letter, politiclaw_draft_call_script,
--                 politiclaw_create_reminder — still work. The off
--                 switch silences proactive surfacing, not the tools
--                 themselves.

ALTER TABLE preferences
  ADD COLUMN action_prompting TEXT NOT NULL DEFAULT 'on'
  CHECK (action_prompting IN ('off','on'));
