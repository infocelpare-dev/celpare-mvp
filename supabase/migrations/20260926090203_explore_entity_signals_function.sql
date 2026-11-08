-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260926090203. History: never edit.

-- 4BI, D152. Momentum for tools and models, bucketed. Service role only.
create or replace function public.explore_entity_signals(p_type text, p_ids uuid[])
returns table(
  entity_id uuid,
  views_24h integer, views_7d integer, views_prev7d integer,
  viewers_7d integer, viewers_prev7d integer,
  saves_7d integer, saves_prev7d integer,
  reviews_7d integer, compare_adds_7d integer, post_mentions_7d integer,
  explore_impressions_30d integer, explore_clicks_30d integer)
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $$
  with wanted as (
    select distinct u as id from unnest(coalesce(p_ids, '{}'::uuid[])) u limit 500
  ),
  -- A view: a tool page open; for models (no view table) a click from Explore,
  -- a click on a search result, or an open from a comparison.
  views as (
    select v.tool_id as id, v.user_id, v.created_at as at
      from public.tool_view_events v
     where p_type = 'tool' and v.tool_id in (select id from wanted)
       and v.created_at > now() - interval '14 days'
    union all
    select r.entity_id, r.user_id, r.created_at
      from public.recommendation_events r
     where p_type = 'model' and r.entity_type = 'model' and r.event = 'click'
       and r.entity_id in (select id from wanted)
       and r.created_at > now() - interval '14 days'
    union all
    select s.result_id, s.user_id, s.created_at
      from public.search_result_events s
     where p_type = 'model' and s.result_type = 'model' and s.event = 'click'
       and s.result_id in (select id from wanted)
       and s.created_at > now() - interval '14 days'
    union all
    select c.item_id, c.user_id, c.created_at
      from public.compare_events c
     where p_type = 'model' and c.item_type = 'model' and c.event = 'model_opened_from_comparison'
       and c.item_id in (select id from wanted)
       and c.created_at > now() - interval '14 days'
  ),
  saves as (
    select st.tool_id as id, st.created_at as at from public.user_saved_tools st
     where p_type = 'tool' and st.tool_id in (select id from wanted)
       and st.created_at > now() - interval '14 days'
    union all
    select sm.model_id, sm.created_at from public.user_saved_models sm
     where p_type = 'model' and sm.model_id in (select id from wanted)
       and sm.created_at > now() - interval '14 days'
    union all
    select case when p_type = 'tool' then ci.tool_id else ci.model_id end, ci.created_at
      from public.user_collection_items ci
     where ((p_type = 'tool' and ci.tool_id in (select id from wanted))
         or (p_type = 'model' and ci.model_id in (select id from wanted)))
       and ci.created_at > now() - interval '14 days'
  ),
  v as (
    select id,
      count(*) filter (where at > now() - interval '24 hours') as v24,
      count(*) filter (where at > now() - interval '7 days') as v7,
      count(*) filter (where at <= now() - interval '7 days') as vp,
      count(distinct user_id) filter (where at > now() - interval '7 days') as u7,
      count(distinct user_id) filter (where at <= now() - interval '7 days') as up
    from views group by id
  ),
  s as (
    select id,
      count(*) filter (where at > now() - interval '7 days') as s7,
      count(*) filter (where at <= now() - interval '7 days') as sp
    from saves group by id
  ),
  rv as (
    select tr.tool_id as id, count(*) as n from public.tool_reviews tr
     where p_type = 'tool' and tr.tool_id in (select id from wanted) and tr.status = 'visible'
       and tr.created_at > now() - interval '7 days'
     group by tr.tool_id
  ),
  ca as (
    select c.item_id as id, count(*) as n from public.compare_events c
     where c.item_type = p_type and c.item_id in (select id from wanted) and c.event = 'item_added'
       and c.created_at > now() - interval '7 days'
     group by c.item_id
  ),
  pm as (
    select case when p_type = 'tool' then p.tool_id else p.model_id end as id, count(*) as n
      from public.posts p
     where ((p_type = 'tool' and p.tool_id in (select id from wanted))
         or (p_type = 'model' and p.model_id in (select id from wanted)))
       and p.status = 'visible' and p.deleted_at is null
       and p.created_at > now() - interval '7 days'
     group by 1
  ),
  ex as (
    select r.entity_id as id,
      count(*) filter (where r.event = 'impression') as imp,
      count(*) filter (where r.event = 'click') as clk
      from public.recommendation_events r
     where r.entity_type = p_type and r.entity_id in (select id from wanted)
       and r.created_at > now() - interval '30 days'
     group by r.entity_id
  )
  select w.id,
    coalesce(v.v24, 0)::int, coalesce(v.v7, 0)::int, coalesce(v.vp, 0)::int,
    coalesce(v.u7, 0)::int, coalesce(v.up, 0)::int,
    coalesce(s.s7, 0)::int, coalesce(s.sp, 0)::int,
    coalesce(rv.n, 0)::int, coalesce(ca.n, 0)::int, coalesce(pm.n, 0)::int,
    coalesce(ex.imp, 0)::int, coalesce(ex.clk, 0)::int
  from wanted w
  left join v on v.id = w.id
  left join s on s.id = w.id
  left join rv on rv.id = w.id
  left join ca on ca.id = w.id
  left join pm on pm.id = w.id
  left join ex on ex.id = w.id
  where p_type in ('tool', 'model');
$$;

revoke all on function public.explore_entity_signals(text, uuid[]) from public, anon, authenticated;
grant execute on function public.explore_entity_signals(text, uuid[]) to service_role;
