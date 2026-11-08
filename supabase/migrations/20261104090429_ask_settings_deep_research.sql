-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20261104090429. History: never edit.

-- Remember the Ask composer switches as the person left them (founder 2026-11-04, D233).
-- Adds a typed deepResearch boolean to the ask_settings shape check; webSearch was already there.
alter table public.profiles drop constraint profiles_ask_settings_shape;
alter table public.profiles add constraint profiles_ask_settings_shape check (
  jsonb_typeof(ask_settings) = 'object'
  and (not (ask_settings ? 'answerLength') or (ask_settings ->> 'answerLength') = any (array['short','balanced','detailed']))
  and (not (ask_settings ? 'webSearch') or jsonb_typeof(ask_settings -> 'webSearch') = 'boolean')
  and (not (ask_settings ? 'saveHistory') or jsonb_typeof(ask_settings -> 'saveHistory') = 'boolean')
  and (not (ask_settings ? 'deepResearch') or jsonb_typeof(ask_settings -> 'deepResearch') = 'boolean')
  and pg_column_size(ask_settings) < 2000
);
