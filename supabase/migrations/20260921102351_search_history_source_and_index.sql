-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260921102351. History: never edit.

alter table public.search_events drop constraint if exists search_events_source_check;
alter table public.search_events add constraint search_events_source_check
  check (source = any (array['explore','ask','api','admin','search']));

create index if not exists search_events_user_idx
  on public.search_events (user_id, created_at desc)
  where user_id is not null;
