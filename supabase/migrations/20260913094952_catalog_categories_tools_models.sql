-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260913094952. History: never edit.

-- Phase 4B part 1. The data Ask Celpare is allowed to see.
-- Hard rule 3 in CLAUDE.md: every tool and model row carries submitted_at and source.

-- array_to_string is STABLE, not IMMUTABLE, so Postgres refuses it inside a
-- generated column. It is deterministic for text[], so wrap it rather than
-- dropping tags and features out of the search index.
create or replace function public.immutable_join(arr text[])
returns text language sql immutable parallel safe
as $function$ select coalesce(array_to_string(arr, ' '), '') $function$;

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  slug extensions.citext not null unique,
  name text not null check (char_length(name) between 2 and 60),
  description text check (description is null or char_length(description) <= 200),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.tools (
  id uuid primary key default gen_random_uuid(),
  slug extensions.citext not null unique,
  name text not null check (char_length(name) between 1 and 120),
  tagline text check (tagline is null or char_length(tagline) <= 200),
  description text check (description is null or char_length(description) <= 4000),
  website_url text check (website_url is null or website_url ~ '^https?://'),
  docs_url text check (docs_url is null or docs_url ~ '^https?://'),
  logo_url text,
  -- Human readable pricing summary. The AI quotes this verbatim rather than
  -- reasoning about money it cannot verify.
  pricing text check (pricing is null or char_length(pricing) <= 300),
  pricing_model text check (pricing_model is null or pricing_model in ('free','freemium','paid','enterprise')),
  tags text[] not null default '{}',
  features text[] not null default '{}',
  platforms text[] not null default '{}',
  -- D40: null until real reviews exist. Never an invented number.
  rating numeric(2,1) check (rating is null or (rating >= 0 and rating <= 5)),
  rating_count integer not null default 0,
  status text not null default 'approved'
    check (status in ('pending','changes_required','approved','rejected')),
  verified boolean not null default false,
  developer_id uuid references public.profiles(id) on delete set null,
  submitted_at timestamptz not null default now(),
  source text not null check (source in ('admin_seed','developer_submission','import')),
  published_at timestamptz,
  popularity_score double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.models (
  id uuid primary key default gen_random_uuid(),
  slug extensions.citext not null unique,
  name text not null check (char_length(name) between 1 and 120),
  provider text not null,
  description text check (description is null or char_length(description) <= 4000),
  context_window integer check (context_window is null or context_window > 0),
  input_price_per_m numeric(10,4),
  output_price_per_m numeric(10,4),
  modalities text[] not null default '{}',
  tags text[] not null default '{}',
  website_url text check (website_url is null or website_url ~ '^https?://'),
  status text not null default 'approved'
    check (status in ('pending','changes_required','approved','rejected')),
  submitted_at timestamptz not null default now(),
  source text not null check (source in ('admin_seed','developer_submission','import')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tool_categories (
  tool_id uuid not null references public.tools(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  primary key (tool_id, category_id)
);

alter table public.tools
  add column if not exists search_vector tsvector
  generated always as (
    setweight(to_tsvector('english'::regconfig, coalesce(name, '')), 'A') ||
    setweight(to_tsvector('english'::regconfig, coalesce(tagline, '')), 'B') ||
    setweight(to_tsvector('english'::regconfig, public.immutable_join(tags)), 'B') ||
    setweight(to_tsvector('english'::regconfig, public.immutable_join(features)), 'C') ||
    setweight(to_tsvector('english'::regconfig, coalesce(description, '')), 'D')
  ) stored;

create index if not exists tools_search_idx on public.tools using gin (search_vector);
create index if not exists tools_status_idx on public.tools (status) where status = 'approved';

drop trigger if exists tools_touch on public.tools;
create trigger tools_touch before update on public.tools
  for each row execute function public.touch_updated_at();
drop trigger if exists models_touch on public.models;
create trigger models_touch before update on public.models
  for each row execute function public.touch_updated_at();

alter table public.categories enable row level security;
alter table public.tools enable row level security;
alter table public.models enable row level security;
alter table public.tool_categories enable row level security;

drop policy if exists categories_select on public.categories;
create policy categories_select on public.categories
  for select to anon, authenticated using (true);

-- Only approved rows are public. Pending and rejected submissions stay invisible.
drop policy if exists tools_select_approved on public.tools;
create policy tools_select_approved on public.tools
  for select to anon, authenticated using (status = 'approved');

drop policy if exists models_select_approved on public.models;
create policy models_select_approved on public.models
  for select to anon, authenticated using (status = 'approved');

drop policy if exists tool_categories_select on public.tool_categories;
create policy tool_categories_select on public.tool_categories
  for select to anon, authenticated using (
    exists (select 1 from public.tools t where t.id = tool_id and t.status = 'approved')
  );
