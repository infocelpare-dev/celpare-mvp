-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260915080427. History: never edit.

-- Observability the admin dashboard reads. Four of these five are new systems,
-- created here as the minimum safe foundation rather than as finished features:
-- they are empty until something writes to them, and an empty table renders an
-- honest empty state. Nothing is seeded and nothing is estimated (D13, D30).

/* -------------------------------------------------------- security events */

-- Authentication failures, permission denials and rate limit trips.
--
-- auth.audit_log_entries exists on this project and is empty, so Supabase is not
-- populating it here. Our own server actions are the only place that reliably
-- sees a failed sign in, so that is where these are written from.
create table if not exists public.security_events (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in (
               'login_failed', 'login_blocked', 'signup_blocked', 'captcha_failed',
               'permission_denied', 'rate_limited', 'admin_denied', 'suspicious')),
  severity   text not null default 'low' check (severity in ('low', 'medium', 'high', 'critical')),
  user_id    uuid references public.profiles(id),
  -- An email typed into a login form is a claim, not an account. Stored so a
  -- burst against one address is visible, never joined to a profile.
  subject    text check (subject is null or char_length(subject) <= 320),
  ip         inet,
  detail     jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists security_events_created_idx  on public.security_events (created_at desc);
create index if not exists security_events_kind_idx     on public.security_events (kind, created_at desc);
create index if not exists security_events_severity_idx on public.security_events (severity, created_at desc);

alter table public.security_events enable row level security;
revoke all on public.security_events from anon, authenticated;


/* ---------------------------------------------------------- search events */

-- What people looked for and what came back. The search algorithm is untouched:
-- this records the outcome of a search that already happened.
create table if not exists public.search_events (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references public.profiles(id),
  -- The text as typed, capped. Trimmed and lowercased into `normalized` so
  -- "Video editor" and "video  editor" are one popular query and not two.
  query        text not null check (char_length(query) between 1 and 200),
  normalized   text not null check (char_length(normalized) between 1 and 200),
  result_count integer not null default 0 check (result_count >= 0),
  source       text not null default 'explore' check (source in ('explore', 'ask', 'api', 'admin')),
  created_at   timestamptz not null default now()
);

create index if not exists search_events_created_idx on public.search_events (created_at desc);
create index if not exists search_events_norm_idx    on public.search_events (normalized);
create index if not exists search_events_zero_idx    on public.search_events (created_at desc) where result_count = 0;

alter table public.search_events enable row level security;
revoke all on public.search_events from anon, authenticated;

-- A tool being opened, and where from. This is what turns a list of searches
-- into a conversion rate.
create table if not exists public.tool_view_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references public.profiles(id),
  tool_id    uuid not null references public.tools(id) on delete cascade,
  source     text not null default 'direct' check (source in ('direct', 'search', 'explore', 'ask', 'recommendation', 'community')),
  query      text check (query is null or char_length(query) <= 200),
  created_at timestamptz not null default now()
);

create index if not exists tool_view_events_created_idx on public.tool_view_events (created_at desc);
create index if not exists tool_view_events_tool_idx    on public.tool_view_events (tool_id, created_at desc);
create index if not exists tool_view_events_source_idx  on public.tool_view_events (source, created_at desc);

alter table public.tool_view_events enable row level security;
revoke all on public.tool_view_events from anon, authenticated;


/* -------------------------------------------------- recommendation events */

-- There is no recommendation engine yet, and this migration does not build one.
-- This is the table a future one would write to, so the admin visibility layer
-- has a defined shape to read rather than an invented one.
create table if not exists public.recommendation_events (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references public.profiles(id),
  tool_id          uuid references public.tools(id) on delete cascade,
  surface          text not null check (char_length(surface) <= 40),
  -- Which candidate generator put this row in front of somebody. The single
  -- most useful diagnostic a recommender can record, and the cheapest.
  candidate_source text check (candidate_source is null or char_length(candidate_source) <= 40),
  event            text not null check (event in ('impression', 'click', 'save', 'dismiss')),
  position         smallint,
  created_at       timestamptz not null default now()
);

create index if not exists recommendation_events_created_idx on public.recommendation_events (created_at desc);
create index if not exists recommendation_events_tool_idx    on public.recommendation_events (tool_id, event);
create index if not exists recommendation_events_source_idx  on public.recommendation_events (candidate_source, event);

alter table public.recommendation_events enable row level security;
revoke all on public.recommendation_events from anon, authenticated;


/* ------------------------------------------------------------- job runs */

-- There is no scheduler. refresh_tool_terms() is the only maintenance routine
-- and today it is run by hand. This records executions so the Jobs page reports
-- what actually ran, and so a scheduler added later has somewhere to write.
create table if not exists public.job_runs (
  id          uuid primary key default gen_random_uuid(),
  job         text not null check (char_length(job) <= 60),
  status      text not null default 'running' check (status in ('queued', 'running', 'succeeded', 'failed')),
  attempt     smallint not null default 1,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms integer,
  error       text check (error is null or char_length(error) <= 2000),
  detail      jsonb not null default '{}'::jsonb
);

create index if not exists job_runs_job_idx     on public.job_runs (job, started_at desc);
create index if not exists job_runs_status_idx  on public.job_runs (status, started_at desc);

alter table public.job_runs enable row level security;
revoke all on public.job_runs from anon, authenticated;


/* ------------------------------------------------------ platform settings */

-- Platform level configuration that is not community moderation config.
-- community_settings stays exactly as it is: report_hide_threshold() and
-- report_min_account_age_hours() read it, and moving those rows would mean
-- rewriting working functions for tidiness. The admin settings page shows both.
create table if not exists public.platform_settings (
  key         text primary key check (key ~ '^[a-z0-9_.]{2,60}$'),
  category    text not null default 'general' check (category in ('general', 'moderation', 'ai', 'features', 'content', 'announcements')),
  value       jsonb not null,
  description text check (description is null or char_length(description) <= 300),
  updated_by  uuid references public.profiles(id),
  updated_at  timestamptz not null default now()
);

alter table public.platform_settings enable row level security;
revoke all on public.platform_settings from anon, authenticated;

-- Seeded with structure, never with content. Every value here is off or empty:
-- a feature flag that defaults to on would turn something on by migrating.
insert into public.platform_settings (key, category, value, description) values
  ('announcement.active',  'announcements', 'false'::jsonb, 'Whether a platform announcement banner is shown'),
  ('announcement.message', 'announcements', '""'::jsonb,    'The announcement text. Empty means nothing is shown'),
  ('features.community_composer', 'features', 'false'::jsonb, 'The community composer. Off until tasks 4.12 ship'),
  ('features.tool_submission',    'features', 'true'::jsonb,  'Developers may submit tools for review'),
  ('features.model_submission',   'features', 'true'::jsonb,  'Developers may submit models for review'),
  ('features.public_signup',      'features', 'true'::jsonb,  'New accounts may be created'),
  ('moderation.auto_hide',        'moderation','true'::jsonb, 'Auto hide content at the qualified report threshold'),
  ('content.featured_tools',      'content',  '[]'::jsonb,    'Tool slugs featured on Explore, in order'),
  ('content.featured_models',     'content',  '[]'::jsonb,    'Model slugs featured on Explore, in order')
on conflict (key) do nothing;
