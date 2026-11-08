-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260924102003. History: never edit.

-- Aggregate engagement for a set of posts, bucketed by how long ago it happened.
-- Buckets: 0 <1h, 1 1-6h, 2 6-24h, 3 24-72h, 4 72h-7d, 5 older, 9 all time.
-- Returns counts only: no user id ever leaves this function.
-- EXECUTE is service_role only. View, skip and report counts are private
-- analytics, so the ranking server calls this and no browser can.
create or replace function public.feed_post_signals(p_post_ids uuid[])
returns table(post_id uuid, signal text, bucket smallint, n integer, uniq integer, value real)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with ids as (
    select p.id from public.posts p
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
    select f.post_id, f.event, coalesce(f.user_id::text, f.session_id), f.created_at, f.dwell_ms::real
      from public.feed_events f join ids on ids.id = f.post_id
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
  -- One watch row per viewer: the furthest they got, and when.
  watch as (
    select v.post_id, 'watch'::text as signal, coalesce(v.user_id::text, v.session_id) as actor,
           max(v.created_at) as at, max(v.percent_watched)::real as value
    from public.post_video_events v join ids on ids.id = v.post_id
    where v.event in ('progress', 'swipe_next', 'completed') and v.percent_watched is not null
      and coalesce(v.user_id::text, v.session_id) is not null
    group by 1, 3
  ),
  -- A viewer who started the same video more than once rewatched it.
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
$$;

revoke all on function public.feed_post_signals(uuid[]) from public, anon, authenticated;
grant execute on function public.feed_post_signals(uuid[]) to service_role;

comment on function public.feed_post_signals(uuid[]) is
  'Community Intelligence: bucketed engagement aggregates for ranking. Counts only, never identities. service_role only.';

-- The caller's own history, as the raw material for their interest profile.
-- Answers for auth.uid() and takes no user id, so nobody can ask about anybody else.
create or replace function public.my_feed_interests()
returns table(action text, post_id uuid, author_id uuid, topic_id uuid, post_kind text,
              tool_id uuid, model_id uuid, term text, value real, at timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with me as (select auth.uid() as uid),
  acts as (
    (select 'like'::text as a, l.entity_id as pid, null::uuid as aid, null::uuid as tid,
            null::uuid as tool, null::uuid as model, null::text as term, null::real as v, l.created_at as at
       from public.likes l, me where l.user_id = me.uid and l.entity_type = 'post'
       order by l.created_at desc limit 200)
    union all
    (select 'save', s.entity_id, null, null, null, null, null, null, s.created_at
       from public.saves s, me where s.user_id = me.uid and s.entity_type = 'post'
       order by s.created_at desc limit 100)
    union all
    (select 'save', ci.post_id, null, null, null, null, null, null, ci.created_at
       from public.user_collection_items ci
       join public.user_collections uc on uc.id = ci.collection_id, me
       where uc.user_id = me.uid and uc.deleted_at is null and ci.post_id is not null
       order by ci.created_at desc limit 100)
    union all
    (select 'repost', r.post_id, null, null, null, null, null, null, r.created_at
       from public.reposts r, me where r.user_id = me.uid
       order by r.created_at desc limit 100)
    union all
    (select 'comment', c.post_id, null, null, null, null, null, null, c.created_at
       from public.comments c, me where c.author_id = me.uid and c.deleted_at is null
       order by c.created_at desc limit 100)
    union all
    (select case v.event
              when 'completed' then 'complete'
              when 'not_interested' then 'not_interested'
              when 'profile_opened' then 'profile_visit'
              when 'started' then 'video_start'
              when 'swipe_next' then case when coalesce(v.percent_watched, 0) < 20 then 'skip' else 'watch' end
              when 'progress' then 'watch'
            end,
            v.post_id, null, null, null, null, null, v.percent_watched::real, v.created_at
       from public.post_video_events v, me
       where v.user_id = me.uid
         and v.event in ('completed', 'not_interested', 'profile_opened', 'started', 'swipe_next', 'progress')
       order by v.created_at desc limit 300)
    union all
    (select case f.event when 'impression' then 'seen' else f.event end,
            f.post_id, null, null, null, null, null, f.dwell_ms::real, f.created_at
       from public.feed_events f, me where f.user_id = me.uid
       order by f.created_at desc limit 300)
    union all
    (select case fb.target_type when 'post' then 'not_interested' when 'author' then 'mute_author' else 'mute_topic' end,
            case when fb.target_type = 'post' then fb.target_id end,
            case when fb.target_type = 'author' then fb.target_id end,
            case when fb.target_type = 'topic' then fb.target_id end,
            null, null, null, null, fb.created_at
       from public.feed_feedback fb, me where fb.user_id = me.uid
       order by fb.created_at desc limit 500)
    union all
    (select 'follow', null, f.following_id, null, null, null, null, null, f.created_at
       from public.follows f, me where f.follower_id = me.uid
       order by f.created_at desc limit 500)
    union all
    (select 'search', null, null, null, null, null, se.normalized, null, se.created_at
       from public.search_events se, me
       where se.user_id = me.uid and se.created_at > now() - interval '90 days'
       order by se.created_at desc limit 50)
    union all
    (select 'compare', null, null, null,
            case when ce.item_type = 'tool' then ce.item_id end,
            case when ce.item_type = 'model' then ce.item_id end,
            null, null, ce.created_at
       from public.compare_events ce, me
       where ce.user_id = me.uid and ce.event = 'item_added' and ce.item_id is not null
         and ce.created_at > now() - interval '90 days'
       order by ce.created_at desc limit 50)
    union all
    (select 'ask', null, null, null, null, null, cv.title, null, cv.created_at
       from public.conversations cv, me
       where cv.user_id = me.uid and cv.deleted_at is null and cv.title is not null
         and cv.created_at > now() - interval '90 days'
       order by cv.created_at desc limit 30)
    union all
    (select 'report', rp.entity_id, null, null, null, null, null, null, rp.created_at
       from public.reports rp, me where rp.reporter_id = me.uid and rp.entity_type = 'post'
       order by rp.created_at desc limit 100)
  )
  select a.a, a.pid, coalesce(a.aid, p.author_id), coalesce(a.tid, p.topic_id), p.kind,
         coalesce(a.tool, p.tool_id), coalesce(a.model, p.model_id), a.term, a.v, a.at
  from acts a
  left join public.posts p on p.id = a.pid and p.deleted_at is null
  where (select uid from me) is not null and a.a is not null
  order by a.at desc;
$$;

revoke all on function public.my_feed_interests() from public, anon, authenticated;
grant execute on function public.my_feed_interests() to authenticated, service_role;

comment on function public.my_feed_interests() is
  'Community Intelligence: the caller''s own actions, the raw material of their interest profile. Answers for auth.uid() only.';

-- Creator analytics for the caller's own posts. Aggregates only, no viewer identities,
-- and no ranking internals.
create or replace function public.my_post_distribution(p_limit integer default 50)
returns table(post_id uuid, created_at timestamptz, impressions integer, reach integer,
              from_for_you integer, from_following integer, from_video integer,
              from_profile integer, from_explore integer, from_search integer, from_other integer,
              watch_ms bigint, completions integer, likes integer, comments integer,
              reposts integer, saves integer, shares integer, follows_generated integer)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with mine as (
    select p.id, p.created_at, p.like_count, p.comment_count, p.repost_count, p.save_count
    from public.posts p
    where p.author_id = auth.uid() and p.deleted_at is null
    order by p.created_at desc
    limit least(greatest(coalesce(p_limit, 50), 1), 200)
  ),
  imp as (
    select f.post_id, f.surface as src, coalesce(f.user_id::text, f.session_id) as actor
      from public.feed_events f join mine on mine.id = f.post_id where f.event = 'impression'
    union all
    select v.post_id, 'video:' || v.source, coalesce(v.user_id::text, v.session_id)
      from public.post_video_events v join mine on mine.id = v.post_id where v.event = 'impression'
  ),
  per_view as (
    select v.post_id, coalesce(v.user_id::text, v.session_id) as actor, max(v.watch_ms) as ms
    from public.post_video_events v join mine on mine.id = v.post_id
    where v.watch_ms is not null
    group by 1, 2
  )
  select m.id, m.created_at,
    (select count(*) from imp where imp.post_id = m.id)::integer,
    (select count(distinct actor) from imp where imp.post_id = m.id)::integer,
    (select count(*) from imp where imp.post_id = m.id and imp.src = 'for_you')::integer,
    (select count(*) from imp where imp.post_id = m.id and imp.src in ('following', 'video:following'))::integer,
    (select count(*) from imp where imp.post_id = m.id and imp.src in ('video:video', 'video:feed'))::integer,
    (select count(*) from imp where imp.post_id = m.id and imp.src in ('profile', 'video:profile'))::integer,
    (select count(*) from imp where imp.post_id = m.id and imp.src = 'video:explore')::integer,
    (select count(*) from public.search_result_events s
      where s.result_type = 'post' and s.result_id = m.id and s.event = 'click')::integer,
    (select count(*) from imp where imp.post_id = m.id and imp.src in ('topic', 'trending', 'post'))::integer,
    coalesce((select sum(ms) from per_view where per_view.post_id = m.id), 0)::bigint,
    (select count(*) from public.post_video_events v where v.post_id = m.id and v.event = 'completed')::integer,
    m.like_count, m.comment_count, m.repost_count, m.save_count,
    (select count(*) from public.post_video_events v where v.post_id = m.id and v.event = 'share')::integer,
    (select count(*) from public.post_video_events v where v.post_id = m.id and v.event = 'follow')::integer
  from mine m
  where auth.uid() is not null
  order by m.created_at desc;
$$;

revoke all on function public.my_post_distribution(integer) from public, anon, authenticated;
grant execute on function public.my_post_distribution(integer) to authenticated, service_role;

comment on function public.my_post_distribution(integer) is
  'Community Intelligence: distribution analytics for the caller''s own posts. Aggregates only.';
