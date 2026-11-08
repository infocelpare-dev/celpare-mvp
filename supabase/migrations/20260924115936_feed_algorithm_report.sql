-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260924115936. History: never edit.

-- Per algorithm version and variant, over the last p_days: the aggregates
-- evaluation.ts turns into metrics. Aggregates only. service_role only: the
-- admin debug view reads it on the server.
create or replace function public.feed_algorithm_report(p_days integer default 7)
returns table(
  algorithm text, variant text, slot smallint,
  impressions integer, opens integer, long_dwells integer,
  viewers integer, creators integer, topics integer,
  fresh_impressions integer, small_creator_impressions integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with win as (
    select f.*, p.author_id, p.topic_id, p.created_at as post_at, pr.follower_count
    from public.feed_events f
    join public.posts p on p.id = f.post_id
    join public.profiles pr on pr.id = p.author_id
    where f.created_at > now() - make_interval(days => least(greatest(coalesce(p_days, 7), 1), 90))
      and f.algorithm is not null
  )
  select w.algorithm, coalesce(w.variant, 'control'), least(w.position, 10)::smallint,
         count(*) filter (where w.event = 'impression')::integer,
         count(*) filter (where w.event = 'open')::integer,
         count(*) filter (where w.event = 'dwell' and w.dwell_ms >= 20000)::integer,
         count(distinct coalesce(w.user_id::text, w.session_id))::integer,
         count(distinct w.author_id) filter (where w.event = 'impression')::integer,
         count(distinct w.topic_id) filter (where w.event = 'impression')::integer,
         count(*) filter (where w.event = 'impression' and w.created_at - w.post_at < interval '48 hours')::integer,
         count(*) filter (where w.event = 'impression' and coalesce(w.follower_count, 0) < 10)::integer
  from win w
  where w.position is not null
  group by 1, 2, 3
  order by 1, 2, 3;
$$;

revoke all on function public.feed_algorithm_report(integer) from public, anon, authenticated;
grant execute on function public.feed_algorithm_report(integer) to service_role;
