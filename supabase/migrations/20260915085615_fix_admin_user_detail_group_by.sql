-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260915085615. History: never edit.

-- The same `group by 1` bug as admin_ai_analytics, in the per user daily
-- rollup. Only the by_day block changes; the rest is carried over unaltered.
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
                -- Written out rather than `group by 1`: position 1 is the whole
                -- jsonb object, and it contains the aggregates.
                group by date_trunc('day', created_at)) s), '[]'::jsonb))
      from public.ai_usage_records where user_id = p_user_id));
  end if;

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
