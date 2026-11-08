-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260925074304. History: never edit.

alter table public.feed_events drop constraint feed_events_event_check;
alter table public.feed_events add constraint feed_events_event_check
  check (event = any (array['impression'::text, 'open'::text, 'dwell'::text, 'serve'::text]));

CREATE OR REPLACE FUNCTION public.feed_post_signals(p_post_ids uuid[])
 RETURNS TABLE(post_id uuid, signal text, bucket smallint, n integer, uniq integer, value real)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with ids as (
    select p.id, p.author_id from public.posts p
    where p.id = any (p_post_ids[1:500])
      and p.status = 'visible' and p.deleted_at is null
  ),
  raw as (
    select l.entity_id as post_id, 'like'::text as signal, l.user_id::text as actor, l.created_at as at, null::real as value
      from public.likes l join ids on ids.id = l.entity_id where l.entity_type = 'post'
    union all
    select c.post_id, 'comment', c.author_id::text, c.created_at, null
      from public.comments c join ids on ids.id = c.post_id
      where c.deleted_at is null and c.status = 'visible'
    union all
    -- feed_v3: the author answered a commenter. The actor is the commenter
    -- answered, so uniq is how many different people the author replied to.
    select c.post_id, 'author_reply', parent.author_id::text, c.created_at, null
      from public.comments c
      join ids on ids.id = c.post_id
      join public.comments parent on parent.id = c.parent_id
      where c.author_id = ids.author_id
        and parent.author_id <> ids.author_id
        and c.deleted_at is null and c.status = 'visible'
        and parent.deleted_at is null and parent.status = 'visible'
    union all
    select r.post_id, 'repost', r.user_id::text, r.created_at, null
      from public.reposts r join ids on ids.id = r.post_id
    union all
    select s.entity_id, 'save', s.user_id::text, s.created_at, null
      from public.saves s join ids on ids.id = s.entity_id where s.entity_type = 'post'
    union all
    select ci.post_id, 'save', uc.user_id::text, ci.created_at, null
      from public.user_collection_items ci
      join public.user_collections uc on uc.id = ci.collection_id
      join ids on ids.id = ci.post_id
      where uc.deleted_at is null
    union all
    -- Serves are delivery records, not engagement: kept out of the signals.
    select f.post_id, f.event, coalesce(f.user_id::text, f.session_id), f.created_at, f.dwell_ms::real
      from public.feed_events f join ids on ids.id = f.post_id
      where f.event <> 'serve'
    union all
    select v.post_id,
      case v.event
        when 'impression' then 'impression'
        when 'started' then 'video_start'
        when 'completed' then 'complete'
        when 'share' then 'share'
        when 'follow' then 'follow_after'
        when 'profile_opened' then 'profile_visit'
        when 'not_interested' then 'not_interested'
        when 'comment_opened' then 'open'
        when 'swipe_next' then case when coalesce(v.percent_watched, 0) < 20 then 'skip' else 'swipe_watched' end
      end,
      coalesce(v.user_id::text, v.session_id), v.created_at, v.percent_watched::real
      from public.post_video_events v join ids on ids.id = v.post_id
      where v.event in ('impression', 'started', 'completed', 'share', 'follow',
                        'profile_opened', 'not_interested', 'comment_opened', 'swipe_next')
    union all
    select fb.target_id, 'not_interested', fb.user_id::text, fb.created_at, null
      from public.feed_feedback fb join ids on ids.id = fb.target_id
      where fb.target_type = 'post'
    union all
    select rp.entity_id, 'report', rp.reporter_id::text, rp.created_at, null
      from public.reports rp join ids on ids.id = rp.entity_id
      where rp.entity_type = 'post'
  ),
  watch as (
    select v.post_id, 'watch'::text as signal, coalesce(v.user_id::text, v.session_id) as actor,
           max(v.created_at) as at, max(v.percent_watched)::real as value
    from public.post_video_events v join ids on ids.id = v.post_id
    where v.event in ('progress', 'swipe_next', 'completed') and v.percent_watched is not null
      and coalesce(v.user_id::text, v.session_id) is not null
    group by 1, 3
  ),
  rewatch as (
    select v.post_id, 'rewatch'::text as signal, coalesce(v.user_id::text, v.session_id) as actor,
           max(v.created_at) as at, null::real as value
    from public.post_video_events v join ids on ids.id = v.post_id
    where v.event = 'started' and coalesce(v.user_id::text, v.session_id) is not null
    group by 1, 3
    having count(*) > 1
  ),
  ev as (
    select * from raw where signal is not null
    union all select * from watch
    union all select * from rewatch
  )
  select e.post_id, e.signal,
    (case
      when e.at > now() - interval '1 hour' then 0
      when e.at > now() - interval '6 hours' then 1
      when e.at > now() - interval '24 hours' then 2
      when e.at > now() - interval '72 hours' then 3
      when e.at > now() - interval '7 days' then 4
      else 5
    end)::smallint,
    count(*)::integer, count(distinct e.actor)::integer, avg(e.value)::real
  from ev e
  group by 1, 2, 3
  union all
  select e.post_id, e.signal, 9::smallint, count(*)::integer, count(distinct e.actor)::integer, avg(e.value)::real
  from ev e
  group by 1, 2
  union all
  select p.id, 'qualified_reports', 9::smallint, p.qualified_report_count, p.qualified_report_count, null
  from public.posts p join ids on ids.id = p.id
  where p.qualified_report_count > 0
  union all
  select p.id, 'author_inactive', 9::smallint, 1, 1, null
  from public.posts p join ids on ids.id = p.id
  join public.profiles pr on pr.id = p.author_id
  where pr.account_status <> 'active'
     or (pr.suspended_until is not null and pr.suspended_until > now());
$function$;
