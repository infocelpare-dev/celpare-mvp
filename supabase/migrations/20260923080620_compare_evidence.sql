-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260923080620. History: never edit.

-- Compare: the structured evidence a comparison is read from.
-- Nothing here duplicates a column that already exists on tools or models.
-- Every table revokes before it grants, because pg_default_acl hands anon
-- arwdDxtm on every new table in public (the finding behind the grant doctrine).

-- 1. Models: identity, limits and the price fields the two existing columns cannot hold.
alter table public.models
  add column family text check (family is null or char_length(family) between 1 and 60),
  add column version text check (version is null or char_length(version) between 1 and 40),
  add column api_model_id text check (api_model_id is null or char_length(api_model_id) between 1 and 120),
  add column release_date date,
  add column lifecycle text check (lifecycle is null or lifecycle in ('preview', 'generally_available', 'deprecated', 'retired')),
  add column open_weights boolean,
  add column max_output_tokens integer check (max_output_tokens is null or max_output_tokens > 0),
  add column output_modalities text[] not null default '{}',
  add column cached_input_price_per_m numeric(12,4) check (cached_input_price_per_m is null or cached_input_price_per_m >= 0),
  add column cache_write_price_per_m numeric(12,4) check (cache_write_price_per_m is null or cache_write_price_per_m >= 0),
  add column batch_input_price_per_m numeric(12,4) check (batch_input_price_per_m is null or batch_input_price_per_m >= 0),
  add column batch_output_price_per_m numeric(12,4) check (batch_output_price_per_m is null or batch_output_price_per_m >= 0),
  add column pricing_note text check (pricing_note is null or char_length(pricing_note) <= 280),
  add column pricing_source_url text check (pricing_source_url is null or pricing_source_url ~ '^https://'),
  add column pricing_verified_at timestamptz;

-- Readable like every other public model column. NOT added to the INSERT or
-- UPDATE column grants: a developer cannot mark their own pricing verified.
grant select (family, version, api_model_id, release_date, lifecycle, open_weights,
  max_output_tokens, output_modalities, cached_input_price_per_m, cache_write_price_per_m,
  batch_input_price_per_m, batch_output_price_per_m, pricing_note, pricing_source_url,
  pricing_verified_at) on public.models to anon, authenticated;

-- 2. Tool pricing plans. One row per plan, each with its own provenance.
create table public.tool_plans (
  id uuid primary key default gen_random_uuid(),
  tool_id uuid not null references public.tools(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  tier text not null check (tier in ('free', 'individual', 'team', 'business', 'enterprise', 'usage', 'other')),
  price_amount numeric(12,2) check (price_amount is null or price_amount >= 0),
  annual_price_amount numeric(12,2) check (annual_price_amount is null or annual_price_amount >= 0),
  currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
  billing_period text check (billing_period is null or billing_period in ('month', 'year', 'one_time', 'usage', 'custom')),
  per_seat boolean not null default false,
  trial_days smallint check (trial_days is null or trial_days between 1 and 365),
  limits text check (limits is null or char_length(limits) <= 500),
  sort_order smallint not null default 0,
  source_label text check (source_label is null or char_length(source_label) between 1 and 120),
  source_url text check (source_url is null or source_url ~ '^https://'),
  verified_at timestamptz,
  source text not null default 'admin' check (source in ('admin', 'developer', 'import', 'test-fixture')),
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tool_plans_price_has_currency check (price_amount is null and annual_price_amount is null or currency is not null),
  constraint tool_plans_free_is_free check (tier <> 'free' or coalesce(price_amount, 0) = 0),
  constraint tool_plans_verified_has_source check (verified_at is null or source_url is not null)
);
create index idx_tool_plans_tool on public.tool_plans (tool_id, sort_order);
create trigger tool_plans_touch before update on public.tool_plans
  for each row execute function public.touch_updated_at();

-- 3. Model evaluations. Benchmarks and human preference are the SAME table and a
-- DIFFERENT kind, so they can never be read as one number.
create table public.model_evaluations (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references public.models(id) on delete cascade,
  kind text not null check (kind in ('benchmark', 'human_preference')),
  domain text not null check (domain in ('reasoning', 'coding', 'knowledge', 'math', 'long_context', 'multimodal', 'agentic', 'preference', 'other')),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  metric text not null check (char_length(btrim(metric)) between 1 and 60),
  score numeric not null,
  unit text not null default 'score' check (unit in ('percent', 'score', 'rating', 'other')),
  higher_is_better boolean not null default true,
  ci_low numeric,
  ci_high numeric,
  model_version text check (model_version is null or char_length(model_version) <= 80),
  harness text check (harness is null or char_length(harness) <= 120),
  evaluator text not null check (char_length(btrim(evaluator)) between 1 and 120),
  dataset_version text check (dataset_version is null or char_length(dataset_version) <= 60),
  evaluated_at date not null,
  source_label text not null check (char_length(btrim(source_label)) between 1 and 120),
  source_url text not null check (source_url ~ '^https://'),
  verified_at timestamptz,
  source text not null default 'admin' check (source in ('admin', 'developer', 'import', 'test-fixture')),
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint model_evaluations_ci check (
    (ci_low is null and ci_high is null)
    or (ci_low is not null and ci_high is not null and ci_low <= score and score <= ci_high)
  )
);
create index idx_model_evaluations_model on public.model_evaluations (model_id, kind, domain);

-- 4. The attribute registry. A fact can only name an attribute listed here, so
-- the vocabulary is closed and the matrix rows line up across items.
create table public.compare_attributes (
  key text primary key check (key ~ '^[a-z0-9_]{2,48}$'),
  section text not null check (section in ('identity', 'capabilities', 'integrations', 'deployment', 'technical', 'privacy', 'use_cases', 'strengths', 'limitations')),
  applies_to text[] not null check (cardinality(applies_to) >= 1 and applies_to <@ array['tool', 'model']),
  value_type text not null check (value_type in ('flag', 'text', 'number', 'fit', 'list')),
  label text not null check (char_length(label) between 1 and 60),
  unit text check (unit is null or char_length(unit) <= 20),
  sort_order smallint not null default 0
);

-- 5. Facts. One value per row, one subject per row, provenance on every row.
create table public.compare_facts (
  id uuid primary key default gen_random_uuid(),
  tool_id uuid references public.tools(id) on delete cascade,
  model_id uuid references public.models(id) on delete cascade,
  attribute text not null references public.compare_attributes(key) on update cascade,
  value_flag boolean,
  value_text text check (value_text is null or char_length(btrim(value_text)) between 1 and 280),
  value_number numeric,
  note text check (note is null or char_length(note) <= 280),
  source_label text check (source_label is null or char_length(source_label) between 1 and 120),
  source_url text check (source_url is null or source_url ~ '^https://'),
  verified_at timestamptz,
  source text not null default 'admin' check (source in ('admin', 'developer', 'import', 'test-fixture')),
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint compare_facts_one_subject check (num_nonnulls(tool_id, model_id) = 1),
  constraint compare_facts_one_value check (num_nonnulls(value_flag, value_text, value_number) = 1),
  constraint compare_facts_verified_has_source check (verified_at is null or source_url is not null)
);
create index idx_compare_facts_tool on public.compare_facts (tool_id) where tool_id is not null;
create index idx_compare_facts_model on public.compare_facts (model_id) where model_id is not null;
create trigger compare_facts_touch before update on public.compare_facts
  for each row execute function public.touch_updated_at();

-- The shape rules a CHECK cannot express, because they need the registry row.
create or replace function public.tg_compare_fact_shape()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare
  a public.compare_attributes;
  subject text := case when new.tool_id is not null then 'tool' else 'model' end;
begin
  select * into a from public.compare_attributes where key = new.attribute;
  if not (subject = any (a.applies_to)) then
    raise exception 'attribute_not_applicable:%:%', new.attribute, subject using errcode = '22023';
  end if;
  if (a.value_type = 'flag' and new.value_flag is null)
     or (a.value_type = 'number' and new.value_number is null)
     or (a.value_type in ('text', 'list', 'fit') and new.value_text is null) then
    raise exception 'attribute_value_type:%:%', new.attribute, a.value_type using errcode = '22023';
  end if;
  if a.value_type = 'fit' and new.value_text not in ('strong', 'moderate', 'limited') then
    raise exception 'attribute_fit_value:%', new.value_text using errcode = '22023';
  end if;
  -- Only a list attribute may hold more than one row per subject. Two answers
  -- to "does it have an API" is a contradiction, not extra detail.
  if a.value_type <> 'list' and exists (
    select 1 from public.compare_facts f
    where f.attribute = new.attribute and f.id <> new.id
      and f.tool_id is not distinct from new.tool_id
      and f.model_id is not distinct from new.model_id
  ) then
    raise exception 'attribute_already_recorded:%', new.attribute using errcode = '23505';
  end if;
  return new;
end $$;
revoke all on function public.tg_compare_fact_shape() from public, anon, authenticated;
create trigger compare_facts_shape before insert or update on public.compare_facts
  for each row execute function public.tg_compare_fact_shape();

-- RLS and grants. Readable when the subject is public, never writable by a client.
alter table public.tool_plans enable row level security;
alter table public.model_evaluations enable row level security;
alter table public.compare_attributes enable row level security;
alter table public.compare_facts enable row level security;

revoke all on public.tool_plans, public.model_evaluations, public.compare_attributes, public.compare_facts
  from anon, authenticated;

grant select (id, tool_id, name, tier, price_amount, annual_price_amount, currency, billing_period,
  per_seat, trial_days, limits, sort_order, source_label, source_url, verified_at, updated_at)
  on public.tool_plans to anon, authenticated;
grant select (id, model_id, kind, domain, name, metric, score, unit, higher_is_better, ci_low, ci_high,
  model_version, harness, evaluator, dataset_version, evaluated_at, source_label, source_url, verified_at)
  on public.model_evaluations to anon, authenticated;
grant select on public.compare_attributes to anon, authenticated;
grant select (id, tool_id, model_id, attribute, value_flag, value_text, value_number, note,
  source_label, source_url, verified_at, updated_at)
  on public.compare_facts to anon, authenticated;

create policy tool_plans_select_public on public.tool_plans for select to anon, authenticated
  using (exists (select 1 from public.tools t where t.id = tool_plans.tool_id and t.status = 'approved'));
create policy model_evaluations_select_public on public.model_evaluations for select to anon, authenticated
  using (exists (select 1 from public.models m where m.id = model_evaluations.model_id and m.status = 'approved'));
create policy compare_attributes_select on public.compare_attributes for select to anon, authenticated
  using (true);
create policy compare_facts_select_public on public.compare_facts for select to anon, authenticated
  using (
    (tool_id is not null and exists (select 1 from public.tools t where t.id = compare_facts.tool_id and t.status = 'approved'))
    or (model_id is not null and exists (select 1 from public.models m where m.id = compare_facts.model_id and m.status = 'approved'))
  );

-- 6. The registry itself. Labels are what the matrix rows say.
insert into public.compare_attributes (key, section, applies_to, value_type, label, unit, sort_order) values
  -- tool identity
  ('open_source',            'identity',     '{tool}',       'flag', 'Open source', null, 10),
  ('primary_users',          'identity',     '{tool}',       'list', 'Built for', null, 20),
  ('launched',               'identity',     '{tool}',       'text', 'Launched', null, 30),
  -- tool capabilities
  ('text_generation',        'capabilities', '{tool}',       'flag', 'Text generation', null, 10),
  ('image_generation',       'capabilities', '{tool}',       'flag', 'Image generation', null, 20),
  ('video_generation',       'capabilities', '{tool}',       'flag', 'Video generation', null, 30),
  ('audio_generation',       'capabilities', '{tool}',       'flag', 'Audio and voice', null, 40),
  ('code_generation',        'capabilities', '{tool}',       'flag', 'Code generation', null, 50),
  ('web_search',             'capabilities', '{tool}',       'flag', 'Web search', null, 60),
  ('file_analysis',          'capabilities', '{tool}',       'flag', 'File analysis', null, 70),
  ('automation',             'capabilities', '{tool}',       'flag', 'Automation', null, 80),
  ('agents',                 'capabilities', '{tool}',       'flag', 'Agents', null, 90),
  ('collaboration',          'capabilities', '{tool}',       'flag', 'Team collaboration', null, 100),
  -- model capabilities
  ('reasoning',              'capabilities', '{model}',      'flag', 'Reasoning', null, 10),
  ('coding',                 'capabilities', '{model}',      'flag', 'Coding', null, 20),
  ('vision',                 'capabilities', '{model}',      'flag', 'Vision input', null, 30),
  ('audio_input',            'capabilities', '{model}',      'flag', 'Audio input', null, 40),
  ('video_input',            'capabilities', '{model}',      'flag', 'Video input', null, 50),
  ('image_output',           'capabilities', '{model}',      'flag', 'Image generation', null, 60),
  ('tool_calling',           'capabilities', '{model}',      'flag', 'Tool calling', null, 70),
  ('structured_outputs',     'capabilities', '{model}',      'flag', 'Structured outputs', null, 80),
  ('multilingual',           'capabilities', '{model}',      'flag', 'Multilingual', null, 90),
  ('agentic',                'capabilities', '{model}',      'flag', 'Agentic use', null, 100),
  -- integrations
  ('integration_github',     'integrations', '{tool}',       'flag', 'GitHub', null, 10),
  ('integration_slack',      'integrations', '{tool}',       'flag', 'Slack', null, 20),
  ('integration_google',     'integrations', '{tool}',       'flag', 'Google Workspace', null, 30),
  ('integration_microsoft',  'integrations', '{tool}',       'flag', 'Microsoft 365', null, 40),
  ('integration_notion',     'integrations', '{tool}',       'flag', 'Notion', null, 50),
  ('integration_zapier',     'integrations', '{tool}',       'flag', 'Zapier', null, 60),
  ('integration_webhooks',   'integrations', '{tool}',       'flag', 'Webhooks', null, 70),
  ('integration_other',      'integrations', '{tool}',       'list', 'Other integrations', null, 80),
  -- deployment
  ('deploy_cloud',           'deployment',   '{tool,model}', 'flag', 'Hosted cloud', null, 10),
  ('deploy_api',             'deployment',   '{tool,model}', 'flag', 'API access', null, 20),
  ('deploy_self_hosted',     'deployment',   '{tool,model}', 'flag', 'Self hosted', null, 30),
  ('deploy_on_prem',         'deployment',   '{tool,model}', 'flag', 'On premises', null, 40),
  ('deploy_private',         'deployment',   '{tool,model}', 'flag', 'Private deployment', null, 50),
  ('deploy_enterprise',      'deployment',   '{tool,model}', 'flag', 'Enterprise deployment', null, 60),
  ('deploy_providers',       'deployment',   '{model}',      'list', 'Available through', null, 70),
  -- technical
  ('sdks',                   'technical',    '{tool,model}', 'list', 'SDKs', null, 10),
  ('streaming',              'technical',    '{tool,model}', 'flag', 'Streaming', null, 20),
  ('batch_processing',       'technical',    '{tool,model}', 'flag', 'Batch processing', null, 30),
  ('fine_tuning',            'technical',    '{model}',      'flag', 'Fine tuning', null, 40),
  ('embeddings',             'technical',    '{tool,model}', 'flag', 'Embeddings', null, 50),
  ('rate_limits',            'technical',    '{tool,model}', 'text', 'Rate limits', null, 60),
  ('versioning',             'technical',    '{model}',      'text', 'Versioning', null, 70),
  ('knowledge_cutoff',       'technical',    '{model}',      'text', 'Knowledge cutoff', null, 80),
  -- privacy and trust
  ('privacy_policy',         'privacy',      '{tool,model}', 'text', 'Privacy policy', null, 10),
  ('trains_on_user_data',    'privacy',      '{tool,model}', 'text', 'Trains on your data', null, 20),
  ('data_retention',         'privacy',      '{tool,model}', 'text', 'Data retention', null, 30),
  ('encryption',             'privacy',      '{tool,model}', 'text', 'Encryption', null, 40),
  ('enterprise_controls',    'privacy',      '{tool,model}', 'flag', 'Enterprise controls', null, 50),
  ('certifications',         'privacy',      '{tool,model}', 'list', 'Certifications', null, 60),
  ('data_residency',         'privacy',      '{tool,model}', 'list', 'Data residency', null, 70),
  -- documented use case fit
  ('fit_coding',             'use_cases',    '{tool,model}', 'fit',  'Coding', null, 10),
  ('fit_research',           'use_cases',    '{tool,model}', 'fit',  'Research', null, 20),
  ('fit_writing',            'use_cases',    '{tool,model}', 'fit',  'Writing', null, 30),
  ('fit_image',              'use_cases',    '{tool,model}', 'fit',  'Image generation', null, 40),
  ('fit_video',              'use_cases',    '{tool,model}', 'fit',  'Video generation', null, 50),
  ('fit_business',           'use_cases',    '{tool,model}', 'fit',  'Business', null, 60),
  ('fit_agents',             'use_cases',    '{tool,model}', 'fit',  'Agents', null, 70),
  ('fit_api',                'use_cases',    '{tool,model}', 'fit',  'API development', null, 80),
  ('fit_personal',           'use_cases',    '{tool,model}', 'fit',  'Personal use', null, 90),
  -- trade offs
  ('strength',               'strengths',    '{tool,model}', 'list', 'Strength', null, 10),
  ('limitation',             'limitations',  '{tool,model}', 'list', 'Limitation', null, 10);
