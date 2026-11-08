-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260921103320. History: never edit.

-- Engagement signals for ranking, as AGGREGATES ONLY.
--
-- SECURITY DEFINER because tool_view_events, user_saved_tools and
-- user_saved_models are closed to every client role, and they must stay closed:
-- who saved what is private, and D88 settled that the analytics tables never get
-- a row policy. A count per entity is not a row, which is the same line the
-- developer analytics board is drawn on.
--
-- tools.popularity_score is NOT used. It is a real column and it is dead: all 56
-- rows read 0 and no trigger maintains it, the same trap posts.score set for the
-- feed. Popularity is computed from counts that are actually written.
create or replace function public.search_engagement(p_type text, p_ids uuid[])
returns table (
  entity_id uuid,
  views_30d integer,
  views_total integer,
  saves integer,
  reviews integer,
  mentions integer
)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select
    e.id as entity_id,
    case when p_type = 'tool' then (
      select count(*)::int from public.tool_view_events v
      where v.tool_id = e.id and v.created_at > now() - interval '30 days'
    ) else 0 end,
    case when p_type = 'tool' then (
      select count(*)::int from public.tool_view_events v where v.tool_id = e.id
    ) else 0 end,
    case
      when p_type = 'tool' then
        (select count(*)::int from public.user_saved_tools s where s.tool_id = e.id)
      when p_type = 'model' then
        (select count(*)::int from public.user_saved_models s where s.model_id = e.id)
      else 0
    end,
    case when p_type = 'tool' then (
      select count(*)::int from public.tool_reviews r
      where r.tool_id = e.id and r.status = 'visible'
    ) else 0 end,
    case
      when p_type = 'tool' then
        (select count(*)::int from public.posts po
         where po.tool_id = e.id and po.status = 'visible' and po.deleted_at is null)
      when p_type = 'model' then
        (select count(*)::int from public.posts po
         where po.model_id = e.id and po.status = 'visible' and po.deleted_at is null)
      else 0
    end
  from unnest(coalesce(p_ids, '{}')) as e(id)
  where p_type in ('tool', 'model')
    and cardinality(coalesce(p_ids, '{}')) <= 200;
$$;

revoke all on function public.search_engagement(text, uuid[]) from public;
grant execute on function public.search_engagement(text, uuid[]) to anon, authenticated;

-- What people did with this result the last time it was shown for this query.
--
-- Position aware on purpose. A result shown at rank 1 collects clicks because
-- it is at rank 1, so a raw click rate fed back into ranking is a loop that
-- promotes whatever is already on top. Returning avg_position alongside lets the
-- ranker compare the observed rate against what that position would earn anyway.
create or replace function public.search_behaviour(p_normalized text, p_type text, p_ids uuid[])
returns table (
  entity_id uuid,
  impressions integer,
  clicks integer,
  strong integer,
  avg_position real
)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select
    e.id,
    count(*) filter (where s.event = 'impression')::int,
    count(*) filter (where s.event = 'click')::int,
    -- A save, a like, a follow or an outbound click says far more than a click:
    -- the person went on to do something with what they found.
    count(*) filter (where s.event in ('save','like','follow','share','outbound'))::int,
    coalesce(avg(s."position") filter (where s.event = 'impression'), 0)::real
  from unnest(coalesce(p_ids, '{}')) as e(id)
  left join public.search_result_events s
    on s.result_id = e.id
   and s.result_type = p_type
   and s.normalized = public.search_normalize(p_normalized)
   and s.created_at > now() - interval '90 days'
  where cardinality(coalesce(p_ids, '{}')) <= 200
  group by e.id;
$$;

revoke all on function public.search_behaviour(text, text, uuid[]) from public;
grant execute on function public.search_behaviour(text, text, uuid[]) to anon, authenticated;
