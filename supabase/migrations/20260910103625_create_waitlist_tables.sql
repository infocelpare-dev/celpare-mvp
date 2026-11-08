-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260910103625. History: never edit.

-- Celpare waitlist capture for the pre-launch landing page.
-- Two audiences, kept in separate tables so founder signups can be worked
-- differently from user signups.
-- Security posture: anon may INSERT and nothing else. No anon SELECT, so the
-- email list can never be read back through the public API key.

create extension if not exists citext with schema extensions;

create table if not exists public.waitlist_users (
  id          uuid primary key default gen_random_uuid(),
  email       extensions.citext not null unique,
  source      text not null default 'landing',
  referrer    text,
  created_at  timestamptz not null default now(),
  constraint waitlist_users_email_format
    check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint waitlist_users_source_len check (char_length(source) <= 64),
  constraint waitlist_users_referrer_len check (char_length(referrer) <= 512)
);

create table if not exists public.waitlist_founders (
  id          uuid primary key default gen_random_uuid(),
  email       extensions.citext not null unique,
  company     text,
  source      text not null default 'landing',
  referrer    text,
  created_at  timestamptz not null default now(),
  constraint waitlist_founders_email_format
    check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint waitlist_founders_company_len check (char_length(company) <= 120),
  constraint waitlist_founders_source_len check (char_length(source) <= 64),
  constraint waitlist_founders_referrer_len check (char_length(referrer) <= 512)
);

alter table public.waitlist_users    enable row level security;
alter table public.waitlist_founders enable row level security;

-- Insert only. Deliberately no select, update or delete policy for anon or
-- authenticated: the service role bypasses RLS for admin reads.
drop policy if exists waitlist_users_anon_insert on public.waitlist_users;
create policy waitlist_users_anon_insert
  on public.waitlist_users
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists waitlist_founders_anon_insert on public.waitlist_founders;
create policy waitlist_founders_anon_insert
  on public.waitlist_founders
  for insert
  to anon, authenticated
  with check (true);

create index if not exists waitlist_users_created_at_idx
  on public.waitlist_users (created_at desc);
create index if not exists waitlist_founders_created_at_idx
  on public.waitlist_founders (created_at desc);
