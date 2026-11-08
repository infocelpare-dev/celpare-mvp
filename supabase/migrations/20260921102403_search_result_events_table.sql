-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260921102403. History: never edit.

-- What people do with a search result.
--
-- recommendation_events is the closest existing table and it is NOT this one:
-- its result is a tool_id FK, so it cannot describe a model, a person or a
-- post. New rather than widened, because widening meant dropping that FK.
create table if not exists public.search_result_events (
  id uuid primary key default gen_random_uuid(),
  -- The search this result was shown for. Cascades, so clearing your history
  -- takes the behaviour recorded against it with it.
  query_id uuid references public.search_events(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  -- Kept alongside query_id so analysis survives the history row being cleared.
  normalized text not null check (char_length(normalized) between 1 and 200),
  result_type text not null check (result_type in ('tool','model','person','post')),
  -- Deliberately NOT a foreign key: one column cannot reference four tables.
  result_id uuid not null,
  -- 0 based, and capped. Position is what makes a click interpretable: a click
  -- at rank 1 says far less about relevance than a click at rank 9.
  "position" smallint not null check ("position" between 0 and 200),
  event text not null check (event in
    ('impression','click','save','like','follow','share','outbound')),
  created_at timestamptz not null default now()
);

-- REVOKE BEFORE GRANT. A new table in public is handed arwdDxtm to anon and
-- authenticated by pg_default_acl (G41). Nothing is granted back: this table is
-- written by the service role and read by aggregate functions only, the same
-- closed shape D88 settled for the analytics tables.
revoke all on public.search_result_events from anon, authenticated;
alter table public.search_result_events enable row level security;

create index if not exists search_result_events_query_idx
  on public.search_result_events (query_id);
create index if not exists search_result_events_result_idx
  on public.search_result_events (result_type, result_id, created_at desc);
create index if not exists search_result_events_click_idx
  on public.search_result_events (normalized, result_type, result_id)
  where event <> 'impression';
create index if not exists search_result_events_created_idx
  on public.search_result_events (created_at desc);
