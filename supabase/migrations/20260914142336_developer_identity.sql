-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260914142336. History: never edit.

-- Developer Mode, part one: who a developer is.
--
-- THE AUTHORIZATION MODEL, stated once because everything below depends on it.
--
--   profiles.is_developer  is a UI PREFERENCE. It says "show me the developer
--                          interface". It is client writable by design (D20),
--                          and it grants NOTHING. No policy anywhere reads it.
--
--   developer_profiles     is the AUTHORIZATION. A row here with
--                          accepted_terms_at set is what makes somebody a
--                          developer as far as the database is concerned.
--                          Every write policy on tools and models reads this,
--                          never the flag.
--
-- That split is the whole point: flipping the toggle cannot grant anything,
-- because nothing consults the toggle.
--
-- Deliberately NOT here: any notion of role, plan, moderator or admin. A
-- developer profile is a claim about what you build, not a privilege level.

create table public.developer_profiles (
  id                uuid primary key references public.profiles(id) on delete cascade,
  handle            extensions.citext not null unique,
  display_name      text,
  bio               text,
  company           text,
  website_url       text,
  github_url        text,
  description       text,
  expertise         text[] not null default '{}',
  logo_url          text,

  -- Admin granted, never self set. 05-pricing-plans.md puts the verified
  -- developer badge on the Elite plan, so this is not something a person
  -- switches on about themselves. It is absent from every client grant below.
  verified          boolean not null default false,

  -- The gate. Null means the terms were never accepted, and every developer
  -- write policy requires it to be non null. Written only by
  -- accept_developer_terms() so it can never be backdated by a client.
  accepted_terms_at timestamptz,
  terms_version     text,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- Same lesson as profiles.username on 2026-09-14: the cast to text is what
  -- makes this case sensitive. citext would accept 'MyHandle' against a
  -- lowercase only pattern.
  constraint dev_handle_format check (handle::text ~ '^[a-z0-9_-]{3,30}$'),
  constraint dev_display_name_len check (display_name is null or char_length(display_name) <= 120),
  constraint dev_bio_len         check (bio is null or char_length(bio) <= 280),
  constraint dev_company_len     check (company is null or char_length(company) <= 120),
  constraint dev_description_len check (description is null or char_length(description) <= 2000),
  constraint dev_website_ok check (
    website_url is null
    or (char_length(website_url) <= 2048 and website_url ~ '^https?://[^[:space:]]+$')),
  constraint dev_github_ok check (
    github_url is null
    or (char_length(github_url) <= 2048 and github_url ~ '^https?://([a-z0-9-]+\.)*github\.com/[^[:space:]]+$')),
  constraint dev_logo_ok check (
    logo_url is null
    or (char_length(logo_url) <= 2048 and logo_url ~ '^https?://[^[:space:]]+$')),
  constraint dev_expertise_ok check (
    cardinality(expertise) <= 12
    and char_length(array_to_string(expertise, ',')) <= 300)
);

comment on column public.developer_profiles.verified is
  'Admin granted only. Absent from every client grant. Never self set.';
comment on column public.developer_profiles.accepted_terms_at is
  'The developer authorization gate. Written only by accept_developer_terms().';

create trigger developer_profiles_touch
  before update of handle, display_name, bio, company, website_url, github_url,
                   description, expertise, logo_url
  on public.developer_profiles
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- The authorization predicate. Every developer write policy calls this.
-- Note what it does NOT read: profiles.is_developer, profiles.role,
-- profiles.plan. None of those can turn somebody into a developer.
-- ---------------------------------------------------------------------------
create or replace function public.is_active_developer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.developer_profiles d
    where d.id = (select auth.uid())
      and d.accepted_terms_at is not null
  );
$$;

revoke all on function public.is_active_developer() from public, anon, authenticated;
grant execute on function public.is_active_developer() to authenticated;

-- ---------------------------------------------------------------------------
-- Accepting the terms. An RPC rather than a column grant, so the timestamp is
-- always now() and can never be supplied, backdated or forged by the caller.
-- ---------------------------------------------------------------------------
create or replace function public.accept_developer_terms(p_version text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_version is null or char_length(p_version) > 40 then
    raise exception 'invalid_terms_version' using errcode = '22023';
  end if;

  update public.developer_profiles
     set accepted_terms_at = now(),
         terms_version = p_version,
         updated_at = now()
   where id = (select auth.uid());

  if not found then
    raise exception 'no_developer_profile' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.accept_developer_terms(text) from public, anon, authenticated;
grant execute on function public.accept_developer_terms(text) to authenticated;

-- Withdrawing is the mirror, and it is what makes acceptance meaningful.
create or replace function public.withdraw_developer_terms()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  update public.developer_profiles
     set accepted_terms_at = null, updated_at = now()
   where id = (select auth.uid());
end;
$$;

revoke all on function public.withdraw_developer_terms() from public, anon, authenticated;
grant execute on function public.withdraw_developer_terms() to authenticated;

-- ---------------------------------------------------------------------------
-- RLS. A developer profile is public, like a personal profile.
-- ---------------------------------------------------------------------------
alter table public.developer_profiles enable row level security;

create policy dev_select_anon on public.developer_profiles
  for select to anon using (true);

create policy dev_select_auth on public.developer_profiles
  for select to authenticated using (true);

create policy dev_insert_own on public.developer_profiles
  for insert to authenticated with check ((select auth.uid()) = id);

create policy dev_update_own on public.developer_profiles
  for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- No DELETE policy. Removing a developer profile would orphan submitted tools,
-- so turning the interface off is a preference change, not a deletion.

revoke all on public.developer_profiles from public, anon, authenticated;

grant select (
  id, handle, display_name, bio, company, website_url, github_url,
  description, expertise, logo_url, verified, created_at
) on public.developer_profiles to anon, authenticated;

-- accepted_terms_at is readable by the owner path through the RPC and by the
-- server, and is not in the client SELECT list above because nobody else needs
-- to know when you agreed to anything.
grant select (accepted_terms_at, terms_version) on public.developer_profiles to authenticated;

grant insert (
  id, handle, display_name, bio, company, website_url, github_url,
  description, expertise, logo_url
) on public.developer_profiles to authenticated;

grant update (
  handle, display_name, bio, company, website_url, github_url,
  description, expertise, logo_url
) on public.developer_profiles to authenticated;
-- `verified`, `accepted_terms_at` and `terms_version` appear in no write grant.
