-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260910114401. History: never edit.

-- One account type for everyone. Developer mode is a flag on the profile that
-- the user turns on later from inside the app, not a separate signup path.

create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text not null,
  full_name     text,
  avatar_url    text,
  is_developer  boolean not null default false,
  role          text not null default 'user'
                check (role in ('user','moderator','admin','super_admin')),
  onboarded_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint profiles_full_name_len check (char_length(full_name) <= 120)
);

alter table public.profiles enable row level security;

-- A profile is readable by anyone signed in (public directory needs names and
-- avatars later), but only the owner may change it.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated using (true);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);

-- No insert policy on purpose. Profiles are created by the trigger below,
-- which runs as definer, so a user cannot forge a row for someone else.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep updated_at honest.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Request a demo, from the landing page CTA. Anon may insert, never select.
create table if not exists public.demo_requests (
  id          uuid primary key default gen_random_uuid(),
  email       extensions.citext not null,
  source      text not null default 'landing',
  created_at  timestamptz not null default now(),
  constraint demo_requests_email_format
    check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);

alter table public.demo_requests enable row level security;

drop policy if exists demo_requests_anon_insert on public.demo_requests;
create policy demo_requests_anon_insert on public.demo_requests
  for insert to anon, authenticated with check (true);

create index if not exists demo_requests_created_at_idx
  on public.demo_requests (created_at desc);
