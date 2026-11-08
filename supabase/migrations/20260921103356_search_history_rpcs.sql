-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260921103356. History: never edit.

-- Your own recent searches.
--
-- Same shape as my_recent_activity: SECURITY DEFINER, no id parameter, answers
-- for auth.uid() and nobody else, so it cannot be used to read anybody's search
-- history. D85 already settled that recent activity is private permanently, and
-- a search history is the sharpest example of why.
create or replace function public.my_recent_searches(p_limit integer default 8)
returns table (query text, normalized text, searched_at timestamptz, result_count integer)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  -- One row per distinct search, the most recent time it was run. Retyping the
  -- same words four times is one thing worth listing.
  select distinct on (s.normalized)
    s.query, s.normalized, s.created_at, s.result_count
  from public.search_events s
  where s.user_id = (select auth.uid())
    and (select auth.uid()) is not null
  order by s.normalized, s.created_at desc
  limit greatest(1, least(coalesce(p_limit, 8), 30));
$$;

revoke all on function public.my_recent_searches(integer) from public;
grant execute on function public.my_recent_searches(integer) to authenticated;

-- Remove one item from your history. A DELETE, not a hide: the whole point of
-- removing a search from the list is that it stops existing, the same call
-- Clear recent made in 4AB (D85).
create or replace function public.delete_my_search(p_normalized text)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_uid uuid := auth.uid();
  v_n integer;
begin
  if v_uid is null then
    raise exception 'not_authorised' using errcode = '42501';
  end if;

  delete from public.search_events
  where user_id = v_uid
    and normalized = public.search_normalize(p_normalized);

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function public.delete_my_search(text) from public;
grant execute on function public.delete_my_search(text) to authenticated;

create or replace function public.clear_my_searches()
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_uid uuid := auth.uid();
  v_n integer;
begin
  if v_uid is null then
    raise exception 'not_authorised' using errcode = '42501';
  end if;

  delete from public.search_events where user_id = v_uid;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function public.clear_my_searches() from public;
grant execute on function public.clear_my_searches() to authenticated;

-- What this account tends to be interested in, from what it has actually done.
--
-- DEFINER because tool_view_events and user_saved_tools are closed, and no
-- parameter because it answers for the caller only. Personalization that could
-- be asked about somebody else would be a profile of them, not a preference of
-- yours.
create or replace function public.my_search_affinity()
returns table (kind text, value text, weight real)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  with me as (select auth.uid() as uid),
  -- A save is the strongest thing a person does short of a review, a like is
  -- next, a view is weak and plentiful.
  touched as (
    select s.tool_id, 3.0::real as w from public.user_saved_tools s, me where s.user_id = me.uid
    union all
    select r.tool_id, 2.0::real from public.tool_reactions r, me
      where r.user_id = me.uid and r.value = 1
    union all
    select v.tool_id, 0.5::real from public.tool_view_events v, me
      where v.user_id = me.uid and v.created_at > now() - interval '90 days'
  ),
  cats as (
    select 'category'::text as kind, c.name as value, sum(t.w)::real as weight
    from touched t
    join public.tool_categories tc on tc.tool_id = t.tool_id
    join public.categories c on c.id = tc.category_id
    group by c.name
  ),
  tags as (
    select 'tag'::text as kind, tg as value, sum(t.w)::real as weight
    from touched t
    join public.tools tl on tl.id = t.tool_id
    cross join unnest(coalesce(tl.tags, '{}')) as tg
    group by tg
  )
  select kind, value, weight from (
    select * from cats union all select * from tags
  ) both_kinds
  where (select uid from me) is not null
  order by weight desc
  limit 40;
$$;

revoke all on function public.my_search_affinity() from public;
grant execute on function public.my_search_affinity() to authenticated;
