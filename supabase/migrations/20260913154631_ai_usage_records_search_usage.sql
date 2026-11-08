-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260913154631. History: never edit.

-- Search usage on the billing record.
--
-- Tokens are only half the cost of an answer: a deep research turn pays for
-- four Serper calls before the model writes a word, and today that spend is
-- invisible in the usage table. These columns make it countable per request,
-- per plan and per user, which is what Phase 7 needs to price the plans.
--
-- Booleans for which sources ran, and a count for the external calls actually
-- made, because deep research makes several and a normal answer makes at most
-- one.
alter table public.ai_usage_records
  add column if not exists tool_search boolean not null default false,
  add column if not exists web_search boolean not null default false,
  add column if not exists deep_research boolean not null default false,
  add column if not exists search_calls integer not null default 0;

comment on column public.ai_usage_records.search_calls is
  'External search API calls made for this request. Serper today. Deep research makes several, a normal answer at most one.';
