-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260914091400. History: never edit.

-- Shared foundation for the community and profile work.
--
-- Doctrine, restated because every migration below depends on it:
--   the GRANT is the privilege control, the POLICY is the row filter.
--
-- Supabase default privileges grant ALL on every new table in public to anon
-- and authenticated, and EXECUTE on every new function. Verified live:
--   pg_default_acl objtype r: anon=arwdDxtm, authenticated=arwdDxtm
--   pg_default_acl objtype f: anon=X, authenticated=X
-- Every table and every function below therefore REVOKEs before it GRANTs.

-- ---------------------------------------------------------------------------
-- Moderator predicate.
-- SECURITY DEFINER so the check does not depend on the profiles SELECT policy,
-- which may be narrowed later. STABLE so the planner evaluates it once per
-- statement rather than once per row.
-- Constraint for every policy in this set: a policy whose TO list includes
-- anon must never call this, because anon has no EXECUTE on it.
-- ---------------------------------------------------------------------------
create or replace function public.is_moderator()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('moderator', 'admin', 'super_admin')
  );
$$;

revoke all on function public.is_moderator() from public, anon, authenticated;
grant execute on function public.is_moderator() to authenticated;

-- ---------------------------------------------------------------------------
-- Community settings. One row per tunable.
--
-- 10-community.md section 10 says the auto hide threshold lives in the ranking
-- config file. The auto hide is a database trigger and cannot read a
-- TypeScript file, so the threshold lives here and the config file mirrors it
-- for display. The spec text needs correcting to match.
-- ---------------------------------------------------------------------------
create table public.community_settings (
  key         text primary key,
  value       jsonb not null,
  description text,
  updated_at  timestamptz not null default now()
);

alter table public.community_settings enable row level security;

-- No policy and no client grant at all. Read only by SECURITY DEFINER
-- functions, which do not consult grants.
revoke all on public.community_settings from public, anon, authenticated;

insert into public.community_settings (key, value, description) values
  ('report_hide_threshold', '3'::jsonb,
   'Qualified reports before an item auto hides. D33 and D73, spec section 10.'),
  ('report_min_account_age_hours', '24'::jsonb,
   'A reporter account younger than this does not count toward auto hide. D73.');

create or replace function public.report_hide_threshold()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select (value #>> '{}')::integer
       from public.community_settings
      where key = 'report_hide_threshold'),
    3);
$$;

revoke all on function public.report_hide_threshold() from public, anon, authenticated;

create or replace function public.report_min_account_age_hours()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select (value #>> '{}')::integer
       from public.community_settings
      where key = 'report_min_account_age_hours'),
    24);
$$;

revoke all on function public.report_min_account_age_hours() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Plan limits, from docs/context/05-pricing-plans.md.
-- A null limit_value means unlimited.
--
-- Data rather than constants in a function body, so the caps can change
-- without a migration, and so the UI can render "5 of 5 used" without a fourth
-- copy of the pricing table in TypeScript.
-- ---------------------------------------------------------------------------
create table public.plan_limits (
  plan        text not null,
  limit_key   text not null,
  limit_value integer,
  primary key (plan, limit_key),
  constraint plan_limits_plan_ok check (plan in ('free', 'pro', 'premium')),
  constraint plan_limits_value_ok check (limit_value is null or limit_value >= 0)
);

alter table public.plan_limits enable row level security;

create policy plan_limits_select_all on public.plan_limits
  for select to anon, authenticated using (true);

revoke all on public.plan_limits from public, anon, authenticated;
grant select on public.plan_limits to anon, authenticated;

insert into public.plan_limits (plan, limit_key, limit_value) values
  ('free',    'saved_tools',      5),
  ('pro',     'saved_tools',     15),
  ('premium', 'saved_tools',   null),
  ('free',    'collections',      0),
  ('pro',     'collections',     10),
  ('premium', 'collections',   null),
  ('free',    'favorite_tools',  50),
  ('pro',     'favorite_tools',  50),
  ('premium', 'favorite_tools',  50),
  ('free',    'favorite_models', 50),
  ('pro',     'favorite_models', 50),
  ('premium', 'favorite_models', 50),
  ('free',    'featured_tools',  12),
  ('pro',     'featured_tools',  12),
  ('premium', 'featured_tools',  12),
  ('free',    'featured_posts',  12),
  ('pro',     'featured_posts',  12),
  ('premium', 'featured_posts',  12);

-- ---------------------------------------------------------------------------
-- Resolve one cap for one user.
-- Returns null for unlimited. A missing row is also treated as unlimited, so a
-- seeding gap cannot lock a paying account out of a feature it bought. The
-- completeness check in verification is what keeps that gap detectable.
--
-- The cap is only as trustworthy as profiles.plan, and profiles.plan is
-- trustworthy because it is absent from the authenticated UPDATE grant. If a
-- future migration ever adds it there, every cap below silently evaporates.
-- ---------------------------------------------------------------------------
create or replace function public.plan_limit(p_user_id uuid, p_key text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select l.limit_value
  from public.profiles p
  join public.plan_limits l
    on l.plan = p.plan
   and l.limit_key = p_key
  where p.id = p_user_id;
$$;

revoke all on function public.plan_limit(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Generic per owner row cap, driven by trigger arguments.
--   tg_argv[0] : the owning column on this table, always a uuid to profiles.id
--   tg_argv[1] : the plan_limits key
--   tg_argv[2] : optional extra WHERE fragment, for example 'deleted_at is null'
--
-- tg_argv comes from the CREATE TRIGGER statement, never from a client, so the
-- dynamic SQL below has no user controlled input in it.
--
-- BEFORE INSERT only. Never UPDATE and never DELETE, because a downgrade must
-- go read only rather than destroy data. See 05-pricing-plans.md.
-- ---------------------------------------------------------------------------
create or replace function public.tg_enforce_owner_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_col text    := tg_argv[0];
  limit_key text    := tg_argv[1];
  extra     text    := coalesce(tg_argv[2], 'true');
  owner_id  uuid;
  cap       integer;
  current_n integer;
begin
  owner_id := (to_jsonb(new) ->> owner_col)::uuid;

  -- Serialise inserts by this owner. Without this lock two concurrent inserts
  -- both read cap - 1 and both succeed, putting the account over the cap.
  -- READ COMMITTED does not prevent that on its own. The lock is on the one
  -- owner row, which is exactly the right granularity.
  perform 1 from public.profiles where id = owner_id for update;

  cap := public.plan_limit(owner_id, limit_key);
  if cap is null then
    return new;
  end if;

  execute format(
    'select count(*) from public.%I where %I = $1 and (%s)',
    tg_table_name, owner_col, extra)
  into current_n
  using owner_id;

  if current_n >= cap then
    raise exception 'plan_limit_reached:%:%', limit_key, cap
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke all on function public.tg_enforce_owner_cap() from public, anon, authenticated;
