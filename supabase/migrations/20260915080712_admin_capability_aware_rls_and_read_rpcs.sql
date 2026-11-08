-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260915080712. History: never edit.

-- Reading. Two mechanisms, chosen per table rather than one blanket bypass.
--
--   Ordinary RLS, through the admin's own session, wherever the existing
--   policies already say what staff may see. Tools, models, posts, comments and
--   reports all work this way, so the admin dashboard is subject to the same
--   boundary as every other surface and there is no view everything shortcut.
--
--   A SECURITY DEFINER RPC only where the data is genuinely out of reach:
--   an email address, auth.users, somebody else's AI usage, the audit log.
--   Every one of them checks a capability first and fails closed.

/* ---------------------------------------------- capability aware policies */

-- is_moderator() predates the capability table and hardcoded three role names.
-- Redefining it in terms of the capability keeps posts_select_auth,
-- comments_select_auth and reports_select_auth working unchanged while the new
-- staff roles get exactly the access the matrix gives them: support and ai_ops
-- do not get to read hidden posts, because they do not hold content.moderate.
create or replace function public.is_moderator()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.has_admin_capability('content.moderate');
$$;

-- Developer operations reviews submissions, which means reading tools and
-- models that are not approved yet. That is a different capability from
-- moderating the community, so it is added beside is_moderator rather than
-- folded into it.
drop policy if exists tools_select_auth on public.tools;
create policy tools_select_auth on public.tools
  for select to authenticated
  using (status = 'approved'
      or developer_id = (select auth.uid())
      or public.is_moderator()
      or public.has_admin_capability('submissions.review'));

drop policy if exists models_select_auth on public.models;
create policy models_select_auth on public.models
  for select to authenticated
  using (status = 'approved'
      or developer_id = (select auth.uid())
      or public.is_moderator()
      or public.has_admin_capability('submissions.review'));

-- Support reads the reports queue without being able to act on it.
drop policy if exists reports_select_auth on public.reports;
create policy reports_select_auth on public.reports
  for select to authenticated
  using ((select auth.uid()) = reporter_id
      or public.has_admin_capability('reports.read'));

-- Staff read the settings surfaces they are allowed to change.
create policy platform_settings_select_staff on public.platform_settings
  for select to authenticated
  using (public.has_admin_capability('settings.manage'));
grant select on public.platform_settings to authenticated;

create policy community_settings_select_staff on public.community_settings
  for select to authenticated
  using (public.has_admin_capability('settings.manage'));
grant select on public.community_settings to authenticated;

create policy job_runs_select_staff on public.job_runs
  for select to authenticated
  using (public.has_admin_capability('jobs.read'));
grant select on public.job_runs to authenticated;

create policy security_events_select_staff on public.security_events
  for select to authenticated
  using (public.has_admin_capability('security.read'));
grant select on public.security_events to authenticated;


/* -------------------------------------------------------- guard shorthand */

create or replace function public.admin_require(p_capability text)
returns void
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not public.has_admin_capability(p_capability) then
    -- 42501 is what every other refusal in this schema raises, so the client
    -- has one code to recognise rather than a code per surface.
    raise exception 'not_authorised:%', p_capability using errcode = '42501';
  end if;
end;
$$;
revoke execute on function public.admin_require(text) from public;
grant execute on function public.admin_require(text) to authenticated;


/* ------------------------------------------------------------- overview */

create or replace function public.admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_users jsonb; v_devs jsonb; v_tools jsonb;
  v_community jsonb; v_ai jsonb; v_platform jsonb;
begin
  perform public.admin_require('admin.access');

  -- Users. Verification is auth.users.email_confirmed_at, which is the real
  -- record; there is no second copy of it on profiles to drift.
  if public.has_admin_capability('users.read') then
    select jsonb_build_object(
      'total',        count(*),
      'new_24h',      count(*) filter (where p.created_at > now() - interval '24 hours'),
      'new_7d',       count(*) filter (where p.created_at > now() - interval '7 days'),
      'active_7d',    count(*) filter (where u.last_sign_in_at > now() - interval '7 days'),
      'active_30d',   count(*) filter (where u.last_sign_in_at > now() - interval '30 days'),
      'verified',     count(*) filter (where u.email_confirmed_at is not null),
      'unverified',   count(*) filter (where u.email_confirmed_at is null),
      'suspended',    count(*) filter (where p.account_status = 'suspended'),
      'disabled',     count(*) filter (where p.account_status = 'disabled'),
      'deleted',      count(*) filter (where p.account_status = 'deleted'),
      'free',         count(*) filter (where p.plan = 'free'),
      'pro',          count(*) filter (where p.plan = 'pro'),
      'premium',      count(*) filter (where p.plan = 'premium'),
      'staff',        count(*) filter (where p.role <> 'user'))
    into v_users
    from public.profiles p
    left join auth.users u on u.id = p.id;
  end if;

  -- Developers. The flag is the preference, the terms record is the
  -- authorization, and the dashboard counts both because they answer different
  -- questions: how many people turned the interface on, and how many can
  -- actually submit.
  select jsonb_build_object(
    'mode_on',     (select count(*) from public.profiles where is_developer),
    'profiles',    (select count(*) from public.developer_profiles),
    'active',      (select count(*) from public.developer_profiles where accepted_terms_at is not null),
    'pending_terms',(select count(*) from public.developer_profiles where accepted_terms_at is null),
    'verified',    (select count(*) from public.developer_profiles where verified),
    'suspended',   (select count(*) from public.profiles p
                     join public.developer_profiles d on d.id = p.id
                    where p.account_status <> 'active'))
  into v_devs;

  select jsonb_build_object(
    'total',      count(*),
    'approved',   count(*) filter (where status = 'approved'),
    'pending',    count(*) filter (where status = 'pending'),
    'draft',      count(*) filter (where status = 'draft'),
    'rejected',   count(*) filter (where status = 'rejected'),
    'changes',    count(*) filter (where status = 'changes_required'),
    'verified',   count(*) filter (where verified),
    'new_7d',     count(*) filter (where created_at > now() - interval '7 days'),
    'models_total',   (select count(*) from public.models),
    'models_pending', (select count(*) from public.models where status = 'pending'),
    'models_approved',(select count(*) from public.models where status = 'approved'))
  into v_tools
  from public.tools;

  select jsonb_build_object(
    'posts',        (select count(*) from public.posts where deleted_at is null),
    'posts_today',  (select count(*) from public.posts where created_at > date_trunc('day', now())),
    'comments',     (select count(*) from public.comments where deleted_at is null),
    'likes',        (select count(*) from public.likes),
    'saves',        (select count(*) from public.saves),
    'reposts',      (select count(*) from public.reposts),
    'follows',      (select count(*) from public.follows),
    'reports_open', (select count(*) from public.reports where status in ('open', 'investigating')),
    'reports_total',(select count(*) from public.reports),
    'hidden',       (select count(*) from public.posts where status <> 'visible')
                  + (select count(*) from public.comments where status <> 'visible'))
  into v_community;

  if public.has_admin_capability('ai.read') then
    select jsonb_build_object(
      'requests',       count(*),
      'requests_today', count(*) filter (where created_at > date_trunc('day', now())),
      'requests_month', count(*) filter (where created_at > date_trunc('month', now())),
      'input_tokens',   coalesce(sum(input_tokens), 0),
      'output_tokens',  coalesce(sum(output_tokens), 0),
      'total_tokens',   coalesce(sum(input_tokens + output_tokens), 0),
      'cost_usd',       round(coalesce(sum(cost_usd), 0)::numeric, 4),
      'cost_month',     round(coalesce(sum(cost_usd) filter (where created_at > date_trunc('month', now())), 0)::numeric, 4),
      'failed',         count(*) filter (where status = 'error'),
      'rate_limited',   count(*) filter (where status = 'rate_limited'),
      'refused',        count(*) filter (where status = 'refused_scope'),
      'avg_latency_ms', coalesce(round(avg(latency_ms) filter (where status = 'ok')), 0),
      'conversations',  (select count(*) from public.conversations where deleted_at is null),
      'messages',       (select count(*) from public.messages))
    into v_ai
    from public.ai_usage_records;
  end if;

  if public.has_admin_capability('security.read') then
    select jsonb_build_object(
      'security_24h',   (select count(*) from public.security_events where created_at > now() - interval '24 hours'),
      'security_high',  (select count(*) from public.security_events
                          where severity in ('high', 'critical') and created_at > now() - interval '7 days'),
      'auth_failures',  (select count(*) from public.security_events
                          where kind in ('login_failed', 'login_blocked', 'captcha_failed')
                            and created_at > now() - interval '24 hours'),
      'admin_actions',  (select count(*) from public.admin_audit_log where created_at > now() - interval '7 days'),
      'jobs_failed',    (select count(*) from public.job_runs where status = 'failed'),
      'jobs_running',   (select count(*) from public.job_runs where status = 'running'))
    into v_platform;
  end if;

  return jsonb_build_object(
    'users', coalesce(v_users, '{}'::jsonb),
    'developers', v_devs,
    'tools', v_tools,
    'community', v_community,
    'ai', coalesce(v_ai, '{}'::jsonb),
    'platform', coalesce(v_platform, '{}'::jsonb),
    'generated_at', now());
end;
$$;


/* ---------------------------------------------------------------- users */

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
    select p.id, p.username::text as username, p.full_name, p.email, p.avatar_url,
           p.role, p.plan, p.account_status, p.is_developer,
           (u.email_confirmed_at is not null) as email_confirmed,
           p.created_at, u.last_sign_in_at
    from public.profiles p
    left join auth.users u on u.id = p.id
    where (v_q is null
           or p.username::text ilike '%' || v_q || '%'
           or coalesce(p.full_name, '') ilike '%' || v_q || '%'
           or p.email ilike '%' || v_q || '%'
           -- An exact id match, so pasting a uuid from a log finds the person.
           or p.id::text = v_q)
      and (p_role   is null or p.role = p_role)
      and (p_plan   is null or p.plan = p_plan)
      and (p_status is null or p.account_status = p_status)
      and (p_verified is null
           or (p_verified = 'yes' and u.email_confirmed_at is not null)
           or (p_verified = 'no'  and u.email_confirmed_at is null))
  ), counted as (
    select b.*, count(*) over () as total_count
    from base b
    order by
      case when p_sort = 'created_asc'  then b.created_at end asc,
      case when p_sort = 'active_desc'  then b.last_sign_in_at end desc nulls last,
      case when p_sort = 'username_asc' then b.username end asc,
      case when p_sort not in ('created_asc', 'active_desc', 'username_asc')
           then b.created_at end desc
    limit v_lim offset v_off
  )
  select c.id, c.username, c.full_name, c.email, c.avatar_url, c.role, c.plan,
         c.account_status, c.is_developer, c.email_confirmed, c.created_at,
         c.last_sign_in_at,
         (select count(*) from public.posts    x where x.author_id = c.id and x.deleted_at is null),
         (select count(*) from public.comments x where x.author_id = c.id and x.deleted_at is null),
         (select count(*) from public.tools    x where x.developer_id = c.id),
         (select count(*) from public.reports  r
            where (r.entity_type = 'user' and r.entity_id = c.id)
               or (r.entity_type = 'post'    and r.entity_id in (select id from public.posts    where author_id = c.id))
               or (r.entity_type = 'comment' and r.entity_id in (select id from public.comments where author_id = c.id))),
         c.total_count
  from counted c;
end;
$$;


create or replace function public.admin_user_detail(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare v_out jsonb;
begin
  perform public.admin_require('users.read');

  select jsonb_build_object(
    'account', jsonb_build_object(
      'id', p.id, 'username', p.username, 'full_name', p.full_name,
      'email', p.email, 'avatar_url', p.avatar_url, 'bio', p.bio,
      'location', p.location, 'website_url', p.website_url,
      'role', p.role, 'plan', p.plan, 'account_status', p.account_status,
      'status_reason', p.status_reason, 'suspended_until', p.suspended_until,
      'is_developer', p.is_developer, 'created_at', p.created_at,
      'onboarded_at', p.onboarded_at,
      'email_confirmed_at', u.email_confirmed_at,
      'last_sign_in_at', u.last_sign_in_at,
      -- Which identity providers are linked, never the tokens behind them.
      'providers', (select coalesce(jsonb_agg(distinct i.provider), '[]'::jsonb)
                      from auth.identities i where i.user_id = p.id),
      'follower_count', p.follower_count, 'following_count', p.following_count),

    'activity', jsonb_build_object(
      'posts',     (select count(*) from public.posts    where author_id = p.id and deleted_at is null),
      'comments',  (select count(*) from public.comments where author_id = p.id and deleted_at is null),
      'likes',     (select count(*) from public.likes    where user_id = p.id),
      'saves',     (select count(*) from public.saves    where user_id = p.id),
      'reposts',   (select count(*) from public.reposts  where user_id = p.id),
      'collections',(select count(*) from public.user_collections where user_id = p.id and deleted_at is null),
      'saved_tools',(select count(*) from public.user_saved_tools where user_id = p.id),
      'tools',     (select count(*) from public.tools    where developer_id = p.id),
      'models',    (select count(*) from public.models   where developer_id = p.id),
      'conversations',(select count(*) from public.conversations where user_id = p.id and deleted_at is null),
      'searches',  (select count(*) from public.search_events where user_id = p.id)),

    'moderation', jsonb_build_object(
      'reports_submitted', (select count(*) from public.reports where reporter_id = p.id),
      'reports_received',  (select count(*) from public.reports r
                             where (r.entity_type = 'user' and r.entity_id = p.id)
                                or (r.entity_type = 'post'    and r.entity_id in (select id from public.posts    where author_id = p.id))
                                or (r.entity_type = 'comment' and r.entity_id in (select id from public.comments where author_id = p.id))),
      'warnings',   (select count(*) from public.moderation_actions where target_user = p.id and action = 'warn'),
      'suspensions',(select count(*) from public.moderation_actions where target_user = p.id and action = 'suspend'),
      'hidden_content', (select count(*) from public.posts where author_id = p.id and status <> 'visible')
                      + (select count(*) from public.comments where author_id = p.id and status <> 'visible')),

    'developer', (select jsonb_build_object(
        'handle', d.handle, 'verified', d.verified,
        'accepted_terms_at', d.accepted_terms_at, 'terms_version', d.terms_version,
        'company', d.company, 'website_url', d.website_url, 'created_at', d.created_at)
      from public.developer_profiles d where d.id = p.id)
  )
  into v_out
  from public.profiles p
  left join auth.users u on u.id = p.id
  where p.id = p_user_id;

  if v_out is null then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;

  -- AI usage is only attached for somebody who is allowed to see spend.
  if public.has_admin_capability('ai.read') then
    v_out := v_out || jsonb_build_object('ai', (
      select jsonb_build_object(
        'requests', count(*),
        'input_tokens', coalesce(sum(input_tokens), 0),
        'output_tokens', coalesce(sum(output_tokens), 0),
        'total_tokens', coalesce(sum(input_tokens + output_tokens), 0),
        'cost_usd', round(coalesce(sum(cost_usd), 0)::numeric, 4),
        'failed', count(*) filter (where status <> 'ok'),
        'by_model', coalesce((
          select jsonb_agg(m order by m->>'model')
          from (select jsonb_build_object(
                  'model', model, 'provider', provider, 'requests', count(*),
                  'tokens', sum(input_tokens + output_tokens),
                  'cost_usd', round(sum(cost_usd)::numeric, 4)) as m
                from public.ai_usage_records where user_id = p_user_id
                group by model, provider) s), '[]'::jsonb),
        'by_day', coalesce((
          select jsonb_agg(d order by d->>'day')
          from (select jsonb_build_object(
                  'day', date_trunc('day', created_at)::date, 'requests', count(*),
                  'tokens', sum(input_tokens + output_tokens),
                  'cost_usd', round(sum(cost_usd)::numeric, 4)) as d
                from public.ai_usage_records
                where user_id = p_user_id and created_at > now() - interval '30 days'
                group by 1) s), '[]'::jsonb))
      from public.ai_usage_records where user_id = p_user_id));
  end if;

  -- The case history, newest first, read only by somebody who can act on it.
  if public.has_admin_capability('users.moderate') or public.has_admin_capability('content.moderate') then
    v_out := v_out || jsonb_build_object('history', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', a.id, 'action', a.action, 'entity_type', a.entity_type,
               'reason', a.reason, 'created_at', a.created_at,
               'actor', ap.username) order by a.created_at desc)
      from public.moderation_actions a
      left join public.profiles ap on ap.id = a.actor_id
      where a.target_user = p_user_id), '[]'::jsonb));
  end if;

  return v_out;
end;
$$;


/* ---------------------------------------------------------- ai operations */

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
            group by 1) s), '[]'::jsonb),
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


/* ------------------------------------------------- search and discovery */

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
            from public.search_events where created_at > v_since group by 1) s), '[]'::jsonb),
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


create or replace function public.admin_recommendation_analytics(p_days integer default 30)
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
        'impressions', count(*) filter (where event = 'impression'),
        'clicks',      count(*) filter (where event = 'click'),
        'saves',       count(*) filter (where event = 'save'),
        'dismissals',  count(*) filter (where event = 'dismiss'))
      from public.recommendation_events where created_at > v_since),
    'by_source', coalesce((
      select jsonb_agg(x order by (x->>'impressions')::bigint desc)
      from (select jsonb_build_object(
              'candidate_source', coalesce(candidate_source, 'unattributed'),
              'impressions', count(*) filter (where event = 'impression'),
              'clicks',      count(*) filter (where event = 'click'),
              'saves',       count(*) filter (where event = 'save')) as x
            from public.recommendation_events where created_at > v_since
            group by candidate_source) s), '[]'::jsonb),
    'by_surface', coalesce((
      select jsonb_agg(x order by (x->>'impressions')::bigint desc)
      from (select jsonb_build_object(
              'surface', surface,
              'impressions', count(*) filter (where event = 'impression'),
              'clicks',      count(*) filter (where event = 'click')) as x
            from public.recommendation_events where created_at > v_since
            group by surface) s), '[]'::jsonb),
    'top_tools', coalesce((
      select jsonb_agg(x order by (x->>'clicks')::bigint desc)
      from (select jsonb_build_object(
              'slug', t.slug, 'name', t.name,
              'impressions', count(*) filter (where e.event = 'impression'),
              'clicks',      count(*) filter (where e.event = 'click'),
              'saves',       count(*) filter (where e.event = 'save')) as x
            from public.recommendation_events e
            join public.tools t on t.id = e.tool_id
            where e.created_at > v_since
            group by t.slug, t.name
            order by count(*) filter (where e.event = 'click') desc
            limit 25) s), '[]'::jsonb));
end;
$$;


create or replace function public.admin_community_analytics(p_days integer default 30)
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
    'by_day', coalesce((
      select jsonb_agg(x order by x->>'day')
      from (
        select jsonb_build_object(
          'day', d::date,
          'posts',    (select count(*) from public.posts    where date_trunc('day', created_at) = d),
          'comments', (select count(*) from public.comments where date_trunc('day', created_at) = d),
          'likes',    (select count(*) from public.likes    where date_trunc('day', created_at) = d),
          'reposts',  (select count(*) from public.reposts  where date_trunc('day', created_at) = d),
          'saves',    (select count(*) from public.saves    where date_trunc('day', created_at) = d),
          'signups',  (select count(*) from public.profiles where date_trunc('day', created_at) = d),
          -- Active means signed in and did something that leaves a row. Sign in
          -- alone is counted separately on the users card, because a session
          -- refresh is not activity.
          'active_users', (
            select count(distinct u) from (
              select author_id u from public.posts    where date_trunc('day', created_at) = d
              union select author_id from public.comments where date_trunc('day', created_at) = d
              union select user_id   from public.likes    where date_trunc('day', created_at) = d
              union select user_id   from public.reposts  where date_trunc('day', created_at) = d
              union select user_id   from public.conversations where date_trunc('day', created_at) = d
            ) a)) as x
        from generate_series(date_trunc('day', v_since), date_trunc('day', now()), interval '1 day') d
      ) s), '[]'::jsonb),
    'by_topic', coalesce((
      select jsonb_agg(x order by (x->>'posts')::bigint desc)
      from (select jsonb_build_object(
              'slug', t.slug, 'name', t.name,
              'posts', count(p.id) filter (where p.deleted_at is null),
              'comments', coalesce(sum(p.comment_count), 0),
              'likes', coalesce(sum(p.like_count), 0)) as x
            from public.topics t
            left join public.posts p on p.topic_id = t.id and p.created_at > v_since
            group by t.slug, t.name) s), '[]'::jsonb),
    'top_creators', coalesce((
      select jsonb_agg(x order by (x->>'posts')::bigint desc)
      from (select jsonb_build_object(
              'username', pr.username, 'user_id', pr.id,
              'posts', count(*),
              'likes', coalesce(sum(p.like_count), 0),
              'comments', coalesce(sum(p.comment_count), 0)) as x
            from public.posts p
            join public.profiles pr on pr.id = p.author_id
            where p.created_at > v_since and p.deleted_at is null
            group by pr.username, pr.id
            order by count(*) desc limit 20) s), '[]'::jsonb));
end;
$$;


/* ------------------------------------------------------------- audit log */

create or replace function public.admin_list_audit(
  p_search text default null,
  p_action text default null,
  p_entity_type text default null,
  p_actor uuid default null,
  p_limit integer default 50,
  p_offset integer default 0
) returns table (
  id uuid, actor_id uuid, actor_username text, actor_role text, action text,
  entity_type text, entity_id text, entity_label text, reason text,
  before_state jsonb, after_state jsonb, ip text, created_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_lim integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_off integer := greatest(coalesce(p_offset, 0), 0);
  v_q   text    := nullif(btrim(coalesce(p_search, '')), '');
begin
  perform public.admin_require('audit.read');

  return query
  with base as (
    select a.*, pr.username::text as actor_username, count(*) over () as total_count
    from public.admin_audit_log a
    left join public.profiles pr on pr.id = a.actor_id
    where (v_q is null
           or a.action ilike '%' || v_q || '%'
           or coalesce(a.entity_label, '') ilike '%' || v_q || '%'
           or coalesce(a.entity_id, '') ilike '%' || v_q || '%'
           or coalesce(a.reason, '') ilike '%' || v_q || '%'
           or coalesce(pr.username::text, '') ilike '%' || v_q || '%')
      and (p_action is null or a.action = p_action)
      and (p_entity_type is null or a.entity_type = p_entity_type)
      and (p_actor is null or a.actor_id = p_actor)
    order by a.created_at desc
    limit v_lim offset v_off
  )
  select b.id, b.actor_id, b.actor_username, b.actor_role, b.action,
         b.entity_type, b.entity_id, b.entity_label, b.reason,
         b.before_state, b.after_state, host(b.ip), b.created_at, b.total_count
  from base b;
end;
$$;


/* --------------------------------------------------------- global search */

-- Finds an entity by name across the dashboard. Every branch is gated on the
-- capability that owns that entity, so this cannot be used to read something a
-- direct visit to the section would refuse.
create or replace function public.admin_global_search(p_query text, p_limit integer default 6)
returns table (kind text, id text, label text, sublabel text, status text, href text)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_q text := nullif(btrim(coalesce(p_query, '')), '');
  v_lim integer := least(greatest(coalesce(p_limit, 6), 1), 20);
begin
  perform public.admin_require('admin.access');
  if v_q is null or char_length(v_q) < 2 then return; end if;

  if public.has_admin_capability('users.read') then
    return query
      select 'user', p.id::text, coalesce(p.username::text, p.email),
             coalesce(p.full_name, p.email), p.account_status,
             '/admin/users/' || p.id::text
      from public.profiles p
      where p.username::text ilike '%' || v_q || '%'
         or coalesce(p.full_name, '') ilike '%' || v_q || '%'
         or p.email ilike '%' || v_q || '%'
         or p.id::text = v_q
      order by p.created_at desc limit v_lim;
  end if;

  if public.has_admin_capability('developers.manage') then
    return query
      select 'developer', d.id::text, d.handle::text,
             coalesce(d.company, d.display_name, ''),
             case when d.accepted_terms_at is null then 'pending' else 'active' end,
             '/admin/developers/' || d.id::text
      from public.developer_profiles d
      where d.handle::text ilike '%' || v_q || '%'
         or coalesce(d.display_name, '') ilike '%' || v_q || '%'
         or coalesce(d.company, '') ilike '%' || v_q || '%'
      order by d.created_at desc limit v_lim;
  end if;

  -- Tools and models are readable to any signed in staff member through the
  -- ordinary policies when approved, so the capability gate here only decides
  -- whether unapproved rows are reachable.
  return query
    select 'tool', t.id::text, t.name, coalesce(t.tagline, ''), t.status,
           '/admin/tools/' || t.id::text
    from public.tools t
    where (t.name ilike '%' || v_q || '%' or t.slug::text ilike '%' || v_q || '%')
      and (t.status = 'approved' or public.has_admin_capability('submissions.review'))
    order by t.created_at desc limit v_lim;

  return query
    select 'model', m.id::text, m.name, coalesce(m.provider, ''), m.status,
           '/admin/models/' || m.id::text
    from public.models m
    where (m.name ilike '%' || v_q || '%' or m.slug::text ilike '%' || v_q || '%')
      and (m.status = 'approved' or public.has_admin_capability('submissions.review'))
    order by m.created_at desc limit v_lim;

  if public.has_admin_capability('reports.read') then
    return query
      select 'report', r.id::text, r.entity_type || ' report: ' || r.reason,
             coalesce(left(r.note, 80), ''), r.status,
             '/admin/reports/' || r.id::text
      from public.reports r
      where r.id::text = v_q
         or coalesce(r.note, '') ilike '%' || v_q || '%'
         or r.reason ilike '%' || v_q || '%'
      order by r.created_at desc limit v_lim;
  end if;

  if public.has_admin_capability('content.moderate') then
    return query
      select 'post', p.id::text, left(p.body, 70), pr.username::text, p.status,
             '/admin/community/post/' || p.id::text
      from public.posts p join public.profiles pr on pr.id = p.author_id
      where p.body ilike '%' || v_q || '%' or p.id::text = v_q
      order by p.created_at desc limit v_lim;

    return query
      select 'comment', c.id::text, left(c.body, 70), pr.username::text, c.status,
             '/admin/community/post/' || c.post_id::text
      from public.comments c join public.profiles pr on pr.id = c.author_id
      where c.body ilike '%' || v_q || '%' or c.id::text = v_q
      order by c.created_at desc limit v_lim;
  end if;

  if public.has_admin_capability('audit.read') then
    return query
      select 'audit', a.id::text, a.action,
             coalesce(a.entity_label, a.entity_type), a.entity_type,
             '/admin/audit?q=' || a.id::text
      from public.admin_audit_log a
      where a.action ilike '%' || v_q || '%'
         or coalesce(a.entity_label, '') ilike '%' || v_q || '%'
      order by a.created_at desc limit v_lim;
  end if;
end;
$$;


revoke execute on function public.admin_overview() from public;
revoke execute on function public.admin_list_users(text, text, text, text, text, text, integer, integer) from public;
revoke execute on function public.admin_user_detail(uuid) from public;
revoke execute on function public.admin_ai_analytics(integer) from public;
revoke execute on function public.admin_search_analytics(integer) from public;
revoke execute on function public.admin_recommendation_analytics(integer) from public;
revoke execute on function public.admin_community_analytics(integer) from public;
revoke execute on function public.admin_list_audit(text, text, text, uuid, integer, integer) from public;
revoke execute on function public.admin_global_search(text, integer) from public;

grant execute on function public.admin_overview() to authenticated;
grant execute on function public.admin_list_users(text, text, text, text, text, text, integer, integer) to authenticated;
grant execute on function public.admin_user_detail(uuid) to authenticated;
grant execute on function public.admin_ai_analytics(integer) to authenticated;
grant execute on function public.admin_search_analytics(integer) to authenticated;
grant execute on function public.admin_recommendation_analytics(integer) to authenticated;
grant execute on function public.admin_community_analytics(integer) to authenticated;
grant execute on function public.admin_list_audit(text, text, text, uuid, integer, integer) to authenticated;
grant execute on function public.admin_global_search(text, integer) to authenticated;
