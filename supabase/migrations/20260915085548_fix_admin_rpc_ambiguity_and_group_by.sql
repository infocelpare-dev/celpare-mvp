-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260915085548. History: never edit.

-- Two bugs, found by calling every admin read as a real session rather than
-- trusting that they compiled.
--
-- 1. admin_list_users raised 42702, column reference "id" is ambiguous.
--    A RETURNS TABLE function's output columns are in scope as variables for
--    the whole body, so the bare `select id from public.posts` in the report
--    count could mean the posts column or the OUT parameter named id. Every
--    column reference in a subquery is now qualified with its table alias.
--
-- 2. Three functions raised 42803, aggregate functions are not allowed in
--    GROUP BY. Each had a daily rollup shaped as
--      select jsonb_build_object('day', date_trunc(...), 'requests', count(*)) as x
--      from ... group by 1
--    where `group by 1` points at the first output column, which is the whole
--    jsonb object, and that object contains count(*). The grouping expression
--    is now written out instead of referenced by position.
--
-- Both were invisible until the functions actually ran: plpgsql does not plan a
-- statement until it is executed, so neither creating them nor reading them
-- back would have caught this.

create or replace function public.admin_list_users(
  p_search text default null,
  p_role   text default null,
  p_plan   text default null,
  p_status text default null,
  p_verified text default null,
  p_sort   text default 'created_desc',
  p_limit  integer default 25,
  p_offset integer default 0
) returns table (
  id uuid, username text, full_name text, email text, avatar_url text,
  role text, plan text, account_status text, is_developer boolean,
  email_confirmed boolean, created_at timestamptz, last_sign_in_at timestamptz,
  post_count bigint, comment_count bigint, tool_count bigint,
  reports_against bigint, total_count bigint
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_lim integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_off integer := greatest(coalesce(p_offset, 0), 0);
  v_q   text    := nullif(btrim(coalesce(p_search, '')), '');
begin
  perform public.admin_require('users.read');

  return query
  with base as (
    select pr.id as uid, pr.username::text as uname, pr.full_name as fname,
           pr.email as mail, pr.avatar_url as avatar,
           pr.role as urole, pr.plan as uplan, pr.account_status as ustatus,
           pr.is_developer as udev,
           (au.email_confirmed_at is not null) as confirmed,
           pr.created_at as joined, au.last_sign_in_at as seen
    from public.profiles pr
    left join auth.users au on au.id = pr.id
    where (v_q is null
           or pr.username::text ilike '%' || v_q || '%'
           or coalesce(pr.full_name, '') ilike '%' || v_q || '%'
           or pr.email ilike '%' || v_q || '%'
           -- An exact id match, so pasting a uuid from a log finds the person.
           or pr.id::text = v_q)
      and (p_role   is null or pr.role = p_role)
      and (p_plan   is null or pr.plan = p_plan)
      and (p_status is null or pr.account_status = p_status)
      and (p_verified is null
           or (p_verified = 'yes' and au.email_confirmed_at is not null)
           or (p_verified = 'no'  and au.email_confirmed_at is null))
  ), counted as (
    select b.*, count(*) over () as total
    from base b
    order by
      case when p_sort = 'created_asc'  then b.joined end asc,
      case when p_sort = 'active_desc'  then b.seen end desc nulls last,
      case when p_sort = 'username_asc' then b.uname end asc,
      case when p_sort not in ('created_asc', 'active_desc', 'username_asc')
           then b.joined end desc
    limit v_lim offset v_off
  )
  select c.uid, c.uname, c.fname, c.mail, c.avatar, c.urole, c.uplan,
         c.ustatus, c.udev, c.confirmed, c.joined, c.seen,
         (select count(*) from public.posts po
           where po.author_id = c.uid and po.deleted_at is null),
         (select count(*) from public.comments co
           where co.author_id = c.uid and co.deleted_at is null),
         (select count(*) from public.tools tl where tl.developer_id = c.uid),
         (select count(*) from public.reports rp
            where (rp.entity_type = 'user' and rp.entity_id = c.uid)
               or (rp.entity_type = 'post'
                   and rp.entity_id in (select po2.id from public.posts po2
                                         where po2.author_id = c.uid))
               or (rp.entity_type = 'comment'
                   and rp.entity_id in (select co2.id from public.comments co2
                                         where co2.author_id = c.uid))),
         c.total
  from counted c;
end;
$$;


create or replace function public.admin_ai_analytics(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 30), 1), 365);
  v_since timestamptz := now() - make_interval(days => v_days);
begin
  perform public.admin_require('ai.read');

  return jsonb_build_object(
    'window_days', v_days,
    'totals', (
      select jsonb_build_object(
        'requests', count(*),
        'ok', count(*) filter (where status = 'ok'),
        'failed', count(*) filter (where status = 'error'),
        'rate_limited', count(*) filter (where status = 'rate_limited'),
        'refused', count(*) filter (where status = 'refused_scope'),
        'filtered', count(*) filter (where status = 'filtered'),
        'input_tokens', coalesce(sum(input_tokens), 0),
        'output_tokens', coalesce(sum(output_tokens), 0),
        'total_tokens', coalesce(sum(input_tokens + output_tokens), 0),
        'cost_usd', round(coalesce(sum(cost_usd), 0)::numeric, 4),
        'search_calls', coalesce(sum(search_calls), 0),
        'deep_research', count(*) filter (where deep_research))
      from public.ai_usage_records where created_at > v_since),
    'latency', (
      select jsonb_build_object(
        'avg', coalesce(round(avg(latency_ms)), 0),
        'p50', coalesce(percentile_disc(0.5) within group (order by latency_ms), 0),
        'p95', coalesce(percentile_disc(0.95) within group (order by latency_ms), 0),
        'p99', coalesce(percentile_disc(0.99) within group (order by latency_ms), 0),
        'max', coalesce(max(latency_ms), 0))
      from public.ai_usage_records
      where created_at > v_since and status = 'ok' and latency_ms is not null),
    'by_day', coalesce((
      select jsonb_agg(x order by x->>'day')
      from (select jsonb_build_object(
              'day', date_trunc('day', created_at)::date,
              'requests', count(*),
              'ok', count(*) filter (where status = 'ok'),
              'failed', count(*) filter (where status <> 'ok'),
              'input_tokens', sum(input_tokens), 'output_tokens', sum(output_tokens),
              'cost_usd', round(sum(cost_usd)::numeric, 4)) as x
            from public.ai_usage_records where created_at > v_since
            -- Written out rather than `group by 1`, which would point at the
            -- whole jsonb object and therefore at the aggregates inside it.
            group by date_trunc('day', created_at)) s), '[]'::jsonb),
    'by_model', coalesce((
      select jsonb_agg(x order by (x->>'requests')::bigint desc)
      from (select jsonb_build_object(
              'model', model, 'provider', provider, 'requests', count(*),
              'input_tokens', sum(input_tokens), 'output_tokens', sum(output_tokens),
              'cost_usd', round(sum(cost_usd)::numeric, 4),
              'failed', count(*) filter (where status <> 'ok'),
              'avg_latency', coalesce(round(avg(latency_ms) filter (where status = 'ok')), 0)) as x
            from public.ai_usage_records where created_at > v_since
            group by model, provider) s), '[]'::jsonb),
    'by_plan', coalesce((
      select jsonb_agg(x order by x->>'plan')
      from (select jsonb_build_object(
              'plan', plan, 'requests', count(*),
              'total_tokens', sum(input_tokens + output_tokens),
              'cost_usd', round(sum(cost_usd)::numeric, 4)) as x
            from public.ai_usage_records where created_at > v_since
            group by plan) s), '[]'::jsonb),
    'by_feature', coalesce((
      select jsonb_agg(x order by (x->>'requests')::bigint desc)
      from (select jsonb_build_object(
              'feature', feature, 'requests', count(*),
              'total_tokens', sum(input_tokens + output_tokens)) as x
            from public.ai_usage_records where created_at > v_since
            group by feature) s), '[]'::jsonb),
    'top_users', coalesce((
      select jsonb_agg(x order by (x->>'total_tokens')::bigint desc)
      from (select jsonb_build_object(
              'user_id', r.user_id,
              'username', pr.username,
              'plan', r.plan,
              'requests', count(*),
              'total_tokens', sum(r.input_tokens + r.output_tokens),
              'cost_usd', round(sum(r.cost_usd)::numeric, 4)) as x
            from public.ai_usage_records r
            left join public.profiles pr on pr.id = r.user_id
            where r.created_at > v_since and r.user_id is not null
            group by r.user_id, pr.username, r.plan
            order by sum(r.input_tokens + r.output_tokens) desc
            limit 20) s), '[]'::jsonb),
    'anonymous_requests', (
      select count(*) from public.ai_usage_records
      where created_at > v_since and user_id is null));
end;
$$;


create or replace function public.admin_search_analytics(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
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
        'searches', count(*),
        'zero_result', count(*) filter (where result_count = 0),
        'with_results', count(*) filter (where result_count > 0),
        'distinct_queries', count(distinct normalized),
        'signed_in', count(*) filter (where user_id is not null))
      from public.search_events where created_at > v_since),
    'tool_views', (
      select jsonb_build_object(
        'total', count(*),
        'from_search', count(*) filter (where source = 'search'),
        'from_explore', count(*) filter (where source = 'explore'),
        'from_ask', count(*) filter (where source = 'ask'))
      from public.tool_view_events where created_at > v_since),
    'by_day', coalesce((
      select jsonb_agg(x order by x->>'day')
      from (select jsonb_build_object(
              'day', date_trunc('day', created_at)::date,
              'searches', count(*),
              'zero_result', count(*) filter (where result_count = 0)) as x
            from public.search_events where created_at > v_since
            group by date_trunc('day', created_at)) s), '[]'::jsonb),
    'popular', coalesce((
      select jsonb_agg(x order by (x->>'searches')::bigint desc)
      from (select jsonb_build_object(
              'query', normalized, 'searches', count(*),
              'avg_results', round(avg(result_count), 1)) as x
            from public.search_events where created_at > v_since
            group by normalized order by count(*) desc limit 25) s), '[]'::jsonb),
    'zero_result', coalesce((
      select jsonb_agg(x order by (x->>'searches')::bigint desc)
      from (select jsonb_build_object('query', normalized, 'searches', count(*)) as x
            from public.search_events
            where created_at > v_since and result_count = 0
            group by normalized order by count(*) desc limit 25) s), '[]'::jsonb),
    'top_tools', coalesce((
      select jsonb_agg(x order by (x->>'views')::bigint desc)
      from (select jsonb_build_object(
              'tool_id', v.tool_id, 'slug', t.slug, 'name', t.name,
              'views', count(*),
              'from_search', count(*) filter (where v.source = 'search')) as x
            from public.tool_view_events v
            join public.tools t on t.id = v.tool_id
            where v.created_at > v_since
            group by v.tool_id, t.slug, t.name
            order by count(*) desc limit 25) s), '[]'::jsonb));
end;
$$;
