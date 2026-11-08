-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260926085859. History: never edit.

-- 4BI, D151. recommendation_events becomes Explore's event table for every entity
-- that is not a post. Additive: tool_id stays, with its FK, for tool rows.
alter table public.recommendation_events
  add column if not exists entity_type text,
  add column if not exists entity_id uuid,
  add column if not exists entity_key text,
  add column if not exists section text,
  add column if not exists algorithm text,
  add column if not exists variant text,
  add column if not exists reason text,
  add column if not exists session_id text;

update public.recommendation_events
   set entity_type = 'tool', entity_id = tool_id
 where entity_type is null and tool_id is not null;

alter table public.recommendation_events
  drop constraint if exists recommendation_events_event_check;
alter table public.recommendation_events
  add constraint recommendation_events_event_check
    check (event = any (array['impression','click','save','dismiss','follow','share','play','complete'])),
  add constraint recommendation_events_entity_type_check
    check (entity_type is null or entity_type = any (array['tool','model','person','topic','category','post','video'])),
  add constraint recommendation_events_entity_key_check
    check (entity_key is null or entity_key ~ '^[a-z0-9-]{1,80}$'),
  add constraint recommendation_events_entity_present_check
    check (entity_type is null or entity_id is not null or entity_key is not null),
  add constraint recommendation_events_section_check
    check (section is null or section ~ '^[a-z-]{1,40}$'),
  add constraint recommendation_events_algorithm_check
    check (algorithm is null or algorithm ~ '^[a-z]+(_[a-z]+)*_v[0-9]+$'),
  add constraint recommendation_events_variant_check
    check (variant is null or variant ~ '^[a-z0-9_]{1,40}$'),
  add constraint recommendation_events_reason_check
    check (reason is null or reason ~ '^[a-z_]{1,40}$'),
  add constraint recommendation_events_session_check
    check (session_id is null or (char_length(session_id) between 8 and 64)),
  add constraint recommendation_events_position_check
    check (position is null or (position >= 0 and position <= 500));

create index if not exists recommendation_events_entity_idx
  on public.recommendation_events (entity_type, entity_id, created_at desc);
create index if not exists recommendation_events_user_time_idx
  on public.recommendation_events (user_id, created_at desc);

-- Still closed: no client grant, RLS on, no policy (D88 shape).
revoke all on public.recommendation_events from public, anon, authenticated;

-- The admin report, extended: by entity type and top items of any type.
-- Keeps every key it returned before (top_tools included).
create or replace function public.admin_recommendation_analytics(p_days integer default 30)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
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
    'by_entity', coalesce((
      select jsonb_agg(x order by (x->>'impressions')::bigint desc)
      from (select jsonb_build_object(
              'entity_type', coalesce(entity_type, 'tool'),
              'impressions', count(*) filter (where event = 'impression'),
              'clicks',      count(*) filter (where event = 'click'),
              'saves',       count(*) filter (where event = 'save'),
              'dismissals',  count(*) filter (where event = 'dismiss')) as x
            from public.recommendation_events where created_at > v_since
            group by coalesce(entity_type, 'tool')) s), '[]'::jsonb),
    'by_section', coalesce((
      select jsonb_agg(x order by (x->>'impressions')::bigint desc)
      from (select jsonb_build_object(
              'section', coalesce(section, 'none'),
              'impressions', count(*) filter (where event = 'impression'),
              'clicks',      count(*) filter (where event = 'click')) as x
            from public.recommendation_events where created_at > v_since
            group by section) s), '[]'::jsonb),
    'top_tools', coalesce((
      select jsonb_agg(x order by (x->>'clicks')::bigint desc)
      from (select jsonb_build_object(
              'slug', t.slug, 'name', t.name,
              'impressions', count(*) filter (where e.event = 'impression'),
              'clicks',      count(*) filter (where e.event = 'click'),
              'saves',       count(*) filter (where e.event = 'save')) as x
            from public.recommendation_events e
            join public.tools t on t.id = coalesce(e.tool_id, case when e.entity_type = 'tool' then e.entity_id end)
            where e.created_at > v_since
            group by t.slug, t.name
            order by count(*) filter (where e.event = 'click') desc
            limit 25) s), '[]'::jsonb));
end;
$function$;

revoke all on function public.admin_recommendation_analytics(integer) from public, anon;
grant execute on function public.admin_recommendation_analytics(integer) to authenticated;
