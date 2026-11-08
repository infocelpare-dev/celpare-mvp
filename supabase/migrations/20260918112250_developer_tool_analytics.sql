-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260918112250. History: never edit.

-- Tool analytics for the developer who submitted the tools.
--
-- WHY SECURITY DEFINER, AGAIN.
--
-- tool_view_events has RLS on, no policies, and no grant to anon or
-- authenticated. That is the same position my_recent_activity found it in and
-- for the same reason: these rows feed the spend and abuse dashboards and
-- telemetry nobody can forge is worth more than telemetry that needs no key.
--
-- Opening a row policy on it would be worse than it looks. A policy like
-- "rows whose tool belongs to me" still hands every signed in developer a
-- filterable cursor over a table containing everybody's traffic, and PostgREST
-- will happily answer count and range queries against it. So the table stays
-- shut and this returns aggregates for tools the caller owns.
--
-- OWNERSHIP IS THE ONLY SCOPE. Every branch joins public.tools and tests
-- developer_id = auth.uid(). There is no tool id parameter, so there is nothing
-- to tamper with: a developer can ask for their own numbers or for nothing.
--
-- RETURNS jsonb, one round trip. The alternative was five typed functions and
-- five requests to draw one screen.

create or replace function public.developer_tool_analytics(p_days int default 7)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with me as (select auth.uid() as uid),
  -- The window, clamped. 1, 7 and 30 are what the board offers; anything else
  -- is still bounded so a crafted call cannot ask for a decade of rows.
  win as (
    select greatest(1, least(coalesce(p_days, 7), 90)) as days
  ),
  bounds as (
    select
      now() - make_interval(days => (select days from win))     as start_at,
      -- The window immediately before this one, the same length, so "up 12%"
      -- compares like with like rather than against all time.
      now() - make_interval(days => (select days from win) * 2) as prev_start_at
    from win
  ),
  mine as (
    select t.id, t.name, t.slug
    from public.tools t, me
    where t.developer_id = me.uid
  ),
  views as (
    select v.tool_id, v.created_at, v.source, v.query
    from public.tool_view_events v
    join mine m on m.id = v.tool_id
  ),
  saves as (
    select s.tool_id, s.created_at
    from public.user_saved_tools s
    join mine m on m.id = s.tool_id
  ),
  reviews as (
    select r.tool_id, r.created_at, r.rating
    from public.tool_reviews r
    join mine m on m.id = r.tool_id
    where r.status = 'visible'
  )
  select jsonb_build_object(
    'days', (select days from win),
    'tool_count', (select count(*) from mine),

    -- Headline numbers for the window, each with the previous window beside it.
    'totals', jsonb_build_object(
      'views',   (select count(*) from views   where created_at >= (select start_at from bounds)),
      'savers',  (select count(*) from saves   where created_at >= (select start_at from bounds)),
      'reviews', (select count(*) from reviews where created_at >= (select start_at from bounds)),
      'viewers', (select count(distinct v.user_id)
                  from public.tool_view_events v
                  join mine m on m.id = v.tool_id
                  where v.created_at >= (select start_at from bounds)
                    and v.user_id is not null)
    ),
    'previous', jsonb_build_object(
      'views',   (select count(*) from views
                   where created_at >= (select prev_start_at from bounds)
                     and created_at <  (select start_at from bounds)),
      'savers',  (select count(*) from saves
                   where created_at >= (select prev_start_at from bounds)
                     and created_at <  (select start_at from bounds)),
      'reviews', (select count(*) from reviews
                   where created_at >= (select prev_start_at from bounds)
                     and created_at <  (select start_at from bounds))
    ),

    -- Lifetime figures, which do not move with the range control.
    'lifetime', jsonb_build_object(
      'views',   (select count(*) from views),
      'savers',  (select count(*) from saves),
      'reviews', (select count(*) from reviews),
      'rating',  (select round(avg(rating)::numeric, 1) from reviews)
    ),

    -- Views per day. Grouped in UTC, which is the basis the chart densifies on.
    'by_day', coalesce((
      select jsonb_agg(jsonb_build_object('day', d, 'value', n) order by d)
      from (
        select date_trunc('day', created_at at time zone 'UTC')::date as d, count(*) as n
        from views
        where created_at >= (select start_at from bounds)
        group by 1
      ) s
    ), '[]'::jsonb),

    -- Which of your tools people actually opened.
    'by_tool', coalesce((
      select jsonb_agg(jsonb_build_object('name', name, 'slug', slug, 'value', n, 'saves', sv) order by n desc)
      from (
        select m.name, m.slug,
               (select count(*) from views v
                 where v.tool_id = m.id
                   and v.created_at >= (select start_at from bounds)) as n,
               (select count(*) from saves s
                 where s.tool_id = m.id
                   and s.created_at >= (select start_at from bounds)) as sv
        from mine m
      ) s
      where n > 0 or sv > 0
    ), '[]'::jsonb),

    -- How people arrived. A part of a whole, so the board draws it as a share.
    'by_source', coalesce((
      select jsonb_agg(jsonb_build_object('label', source, 'value', n) order by n desc)
      from (
        select source, count(*) as n
        from views
        where created_at >= (select start_at from bounds)
        group by 1
      ) s
    ), '[]'::jsonb),

    -- What people had searched for when they landed on one of your tools. The
    -- single most useful thing here for a developer, and it is already recorded.
    'by_query', coalesce((
      select jsonb_agg(jsonb_build_object('label', q, 'value', n) order by n desc)
      from (
        select lower(btrim(query)) as q, count(*) as n
        from views
        where created_at >= (select start_at from bounds)
          and query is not null
          and btrim(query) <> ''
        group by 1
        order by n desc
        limit 8
      ) s
    ), '[]'::jsonb)
  )
  where (select uid from me) is not null;
$$;

revoke all on function public.developer_tool_analytics(int) from public, anon, authenticated;
grant execute on function public.developer_tool_analytics(int) to authenticated;
