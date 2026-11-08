-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260926090212. History: never edit.

-- 4BI, D155. How many people the caller follows saved, reviewed or posted about each
-- tool or model. Counts only. A save (private) is reported only at two or more,
-- so no single save can be inferred. Posts count only when readable (profile_shares).
create or replace function public.my_explore_network(p_type text, p_ids uuid[])
returns table(entity_id uuid, savers integer, reviewers integer, posters integer)
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $$
  with me as (select (select auth.uid()) as uid),
  wanted as (
    select distinct u as id from unnest(coalesce(p_ids, '{}'::uuid[])) u limit 200
  ),
  followed as (
    select f.following_id as id from public.follows f, me where f.follower_id = me.uid
  ),
  sv as (
    select x.id, count(distinct x.user_id) as n from (
      select st.tool_id as id, st.user_id from public.user_saved_tools st
       where p_type = 'tool' and st.tool_id in (select id from wanted)
         and st.user_id in (select id from followed)
      union
      select sm.model_id, sm.user_id from public.user_saved_models sm
       where p_type = 'model' and sm.model_id in (select id from wanted)
         and sm.user_id in (select id from followed)
      union
      select case when p_type = 'tool' then ci.tool_id else ci.model_id end, uc.user_id
        from public.user_collection_items ci
        join public.user_collections uc on uc.id = ci.collection_id and uc.deleted_at is null
       where ((p_type = 'tool' and ci.tool_id in (select id from wanted))
           or (p_type = 'model' and ci.model_id in (select id from wanted)))
         and uc.user_id in (select id from followed)) x
    group by x.id
  ),
  rv as (
    select tr.tool_id as id, count(distinct tr.user_id) as n from public.tool_reviews tr
     where p_type = 'tool' and tr.tool_id in (select id from wanted) and tr.status = 'visible'
       and tr.user_id in (select id from followed)
     group by tr.tool_id
  ),
  ps as (
    select case when p_type = 'tool' then p.tool_id else p.model_id end as id,
           count(distinct p.author_id) as n
      from public.posts p
     where ((p_type = 'tool' and p.tool_id in (select id from wanted))
         or (p_type = 'model' and p.model_id in (select id from wanted)))
       and p.status = 'visible' and p.deleted_at is null
       and p.created_at > now() - interval '90 days'
       and p.author_id in (select id from followed)
       and public.profile_shares(p.author_id, 'posts')
     group by 1
  )
  select w.id,
    case when coalesce(sv.n, 0) >= 2 then sv.n::int else 0 end,
    coalesce(rv.n, 0)::int,
    coalesce(ps.n, 0)::int
  from wanted w
  cross join me
  left join sv on sv.id = w.id
  left join rv on rv.id = w.id
  left join ps on ps.id = w.id
  where me.uid is not null and p_type in ('tool', 'model');
$$;

revoke all on function public.my_explore_network(text, uuid[]) from public, anon;
grant execute on function public.my_explore_network(text, uuid[]) to authenticated;
