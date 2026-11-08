-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20261031064044. History: never edit.

-- Phase ONB: answers to the questions asked after sign up (D224, D225).
-- Private to the person. Read by the server to give a cold account a
-- starting point in ranking, and in aggregate (counts only) by admins.

create table public.user_onboarding (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  role text check (role in ('everyday','professional','student','creator','developer','designer',
                            'marketer','researcher','founder','business','hobbyist','curious')),
  goals text[] not null default '{}'
    check (goals <@ array['find_tool','compare','learn','build','share','news']::text[]),
  category_ids uuid[] not null default '{}' check (cardinality(category_ids) <= 20),
  topic_ids uuid[] not null default '{}' check (cardinality(topic_ids) <= 20),
  tool_ids uuid[] not null default '{}' check (cardinality(tool_ids) <= 30),
  heard_from text check (heard_from in ('x','tiktok','instagram','youtube','linkedin','facebook','reddit',
                                        'google','ai_assistant','product_hunt','friend','newsletter','other')),
  heard_from_other text check (char_length(heard_from_other) between 1 and 60),
  ref text check (ref ~ '^[a-z0-9_-]{1,40}$'),
  skipped text[] not null default '{}'
    check (skipped <@ array['role','goals','interests','tools','heard','people','all']::text[]),
  completed_at timestamptz,
  version smallint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger user_onboarding_touch before update on public.user_onboarding
  for each row execute function public.touch_updated_at();

alter table public.user_onboarding enable row level security;

-- pg_default_acl hands anon and authenticated everything on a new table.
revoke all on public.user_onboarding from anon, authenticated;
grant select on public.user_onboarding to authenticated;
grant insert (user_id, role, goals, category_ids, topic_ids, tool_ids, heard_from, heard_from_other, ref, skipped, completed_at)
  on public.user_onboarding to authenticated;
grant update (role, goals, category_ids, topic_ids, tool_ids, heard_from, heard_from_other, skipped, completed_at)
  on public.user_onboarding to authenticated;

create policy uo_select_own on public.user_onboarding for select to authenticated
  using ((select auth.uid()) = user_id);
create policy uo_insert_own on public.user_onboarding for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy uo_update_own on public.user_onboarding for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- onboarded_at is writable by the owner but not selectable, so it is read here.
create or replace function public.my_onboarding()
returns jsonb
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select jsonb_build_object(
    'onboarded_at', p.onboarded_at,
    'created_at', p.created_at,
    'answers', (select to_jsonb(o) - 'user_id' from public.user_onboarding o where o.user_id = p.id)
  )
  from public.profiles p
  where p.id = (select auth.uid());
$$;
revoke all on function public.my_onboarding() from public, anon;
grant execute on function public.my_onboarding() to authenticated;

-- Counts only, never rows (D226).
create or replace function public.admin_onboarding_summary(p_days integer default 30)
returns jsonb
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 30), 1), 365);
  v_since timestamptz := now() - make_interval(days => v_days);
begin
  perform public.admin_require('analytics.read');

  return jsonb_build_object(
    'window_days', v_days,
    'totals', (
      select jsonb_build_object(
        'signups', (select count(*) from public.profiles where created_at > v_since),
        'started', count(*),
        'completed', count(*) filter (where completed_at is not null and not ('all' = any(skipped))),
        'skipped_all', count(*) filter (where 'all' = any(skipped)),
        'answered_heard', count(*) filter (where heard_from is not null))
      from public.user_onboarding where created_at > v_since),
    'heard_from', coalesce((
      select jsonb_agg(jsonb_build_object('key', heard_from, 'count', n) order by n desc)
      from (select heard_from, count(*) n from public.user_onboarding
            where created_at > v_since and heard_from is not null group by heard_from) s), '[]'::jsonb),
    'heard_other', coalesce((
      select jsonb_agg(jsonb_build_object('key', t, 'count', n) order by n desc)
      from (select lower(heard_from_other) t, count(*) n from public.user_onboarding
            where created_at > v_since and heard_from = 'other' and heard_from_other is not null
            group by lower(heard_from_other) order by count(*) desc limit 20) s), '[]'::jsonb),
    'refs', coalesce((
      select jsonb_agg(jsonb_build_object('key', ref, 'count', n) order by n desc)
      from (select ref, count(*) n from public.user_onboarding
            where created_at > v_since and ref is not null
            group by ref order by count(*) desc limit 25) s), '[]'::jsonb),
    'roles', coalesce((
      select jsonb_agg(jsonb_build_object('key', role, 'count', n) order by n desc)
      from (select role, count(*) n from public.user_onboarding
            where created_at > v_since and role is not null group by role) s), '[]'::jsonb),
    'goals', coalesce((
      select jsonb_agg(jsonb_build_object('key', g, 'count', n) order by n desc)
      from (select g, count(*) n from public.user_onboarding, unnest(goals) g
            where created_at > v_since group by g) s), '[]'::jsonb),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object('key', c.name, 'count', n) order by n desc)
      from (select cid, count(*) n from public.user_onboarding, unnest(category_ids) cid
            where created_at > v_since group by cid) s
      join public.categories c on c.id = s.cid), '[]'::jsonb),
    'topics', coalesce((
      select jsonb_agg(jsonb_build_object('key', t.name, 'count', n) order by n desc)
      from (select tid, count(*) n from public.user_onboarding, unnest(topic_ids) tid
            where created_at > v_since group by tid) s
      join public.topics t on t.id = s.tid), '[]'::jsonb),
    'tools', coalesce((
      select jsonb_agg(jsonb_build_object('key', t.name, 'count', n) order by n desc)
      from (select tid, count(*) n from public.user_onboarding, unnest(tool_ids) tid
            where created_at > v_since group by tid order by count(*) desc limit 20) s
      join public.tools t on t.id = s.tid), '[]'::jsonb));
end;
$$;
revoke all on function public.admin_onboarding_summary(integer) from public, anon;
grant execute on function public.admin_onboarding_summary(integer) to authenticated;

-- Founder 2026-10-31: new accounts only. Everyone who exists now is done.
update public.profiles set onboarded_at = now() where onboarded_at is null;
