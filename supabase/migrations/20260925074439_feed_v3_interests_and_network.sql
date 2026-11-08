-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260925074439. History: never edit.

drop function if exists public.my_feed_interests();

CREATE FUNCTION public.my_feed_interests()
 RETURNS TABLE(action text, post_id uuid, author_id uuid, topic_id uuid, post_kind text, tool_id uuid, model_id uuid, term text, value real, at timestamp with time zone, pos smallint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with me as (select auth.uid() as uid),
  acts as (
    (select 'like'::text as a, l.entity_id as pid, null::uuid as aid, null::uuid as tid,
            null::uuid as tool, null::uuid as model, null::text as term, null::real as v, l.created_at as at,
            null::smallint as pos
       from public.likes l, me where l.user_id = me.uid and l.entity_type = 'post'
       order by l.created_at desc limit 200)
    union all
    (select 'save', s.entity_id, null, null, null, null, null, null, s.created_at, null
       from public.saves s, me where s.user_id = me.uid and s.entity_type = 'post'
       order by s.created_at desc limit 100)
    union all
    (select 'save', ci.post_id, null, null, null, null, null, null, ci.created_at, null
       from public.user_collection_items ci
       join public.user_collections uc on uc.id = ci.collection_id, me
       where uc.user_id = me.uid and uc.deleted_at is null and ci.post_id is not null
       order by ci.created_at desc limit 100)
    union all
    (select 'repost', r.post_id, null, null, null, null, null, null, r.created_at, null
       from public.reposts r, me where r.user_id = me.uid
       order by r.created_at desc limit 100)
    union all
    (select 'comment', c.post_id, null, null, null, null, null, null, c.created_at, null
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
            v.post_id, null, null, null, null, null, v.percent_watched::real, v.created_at, null
       from public.post_video_events v, me
       where v.user_id = me.uid
         and v.event in ('completed', 'not_interested', 'profile_opened', 'started', 'swipe_next', 'progress')
       order by v.created_at desc limit 300)
    union all
    -- Impressions, opens and dwell, with the position they were shown at
    -- (feed_v3 reads position for ignores). Serves are read separately below
    -- so twenty of them per page cannot crowd these out of the limit.
    (select case f.event when 'impression' then 'seen' else f.event end,
            f.post_id, null, null, null, null, null, f.dwell_ms::real, f.created_at, f.position::smallint
       from public.feed_events f, me where f.user_id = me.uid and f.event <> 'serve'
       order by f.created_at desc limit 300)
    union all
    -- feed_v3: delivered to this person in the last day (served state).
    (select 'served', f.post_id, null, null, null, null, null, null, f.created_at, f.position::smallint
       from public.feed_events f, me
       where f.user_id = me.uid and f.event = 'serve' and f.created_at > now() - interval '24 hours'
       order by f.created_at desc limit 200)
    union all
    (select case fb.target_type when 'post' then 'not_interested' when 'author' then 'mute_author' else 'mute_topic' end,
            case when fb.target_type = 'post' then fb.target_id end,
            case when fb.target_type = 'author' then fb.target_id end,
            case when fb.target_type = 'topic' then fb.target_id end,
            null, null, null, null, fb.created_at, null
       from public.feed_feedback fb, me where fb.user_id = me.uid
       order by fb.created_at desc limit 500)
    union all
    (select 'follow', null, f.following_id, null, null, null, null, null, f.created_at, null
       from public.follows f, me where f.follower_id = me.uid
       order by f.created_at desc limit 500)
    union all
    -- feed_v3: who follows this person, for mutual follow affinity (D123).
    (select 'followed_by', null, f.follower_id, null, null, null, null, null, f.created_at, null
       from public.follows f, me where f.following_id = me.uid
       order by f.created_at desc limit 500)
    union all
    -- feed_v3: public engagement WITH this person's posts, for two way author
    -- affinity. Comments and reposts only, each under the actor's own privacy.
    -- Likes are private (likes_select_own) and are never used here. No post id
    -- is returned, so none of this marks anything seen or adds topic interest.
    (select 'engaged_me', null, c.author_id, null, null, null, null, null, c.created_at, null
       from public.comments c join public.posts p on p.id = c.post_id, me
       where p.author_id = me.uid and c.author_id <> me.uid
         and c.deleted_at is null and c.status = 'visible'
         and c.created_at > now() - interval '90 days'
         and public.profile_shares(c.author_id, 'replies')
       order by c.created_at desc limit 200)
    union all
    (select 'engaged_me', null, r.user_id, null, null, null, null, null, r.created_at, null
       from public.reposts r join public.posts p on p.id = r.post_id, me
       where p.author_id = me.uid and r.user_id <> me.uid
         and r.created_at > now() - interval '90 days'
         and public.profile_shares(r.user_id, 'posts')
       order by r.created_at desc limit 200)
    union all
    (select 'search', null, null, null, null, null, se.normalized, null, se.created_at, null
       from public.search_events se, me
       where se.user_id = me.uid and se.created_at > now() - interval '90 days'
       order by se.created_at desc limit 50)
    union all
    (select 'compare', null, null, null,
            case when ce.item_type = 'tool' then ce.item_id end,
            case when ce.item_type = 'model' then ce.item_id end,
            null, null, ce.created_at, null
       from public.compare_events ce, me
       where ce.user_id = me.uid and ce.event = 'item_added' and ce.item_id is not null
         and ce.created_at > now() - interval '90 days'
       order by ce.created_at desc limit 50)
    union all
    (select 'explore', null, null, null, tv.tool_id, null, null, null, tv.created_at, null
       from public.tool_view_events tv, me
       where tv.user_id = me.uid and tv.tool_id is not null
         and tv.created_at > now() - interval '90 days'
       order by tv.created_at desc limit 50)
    union all
    (select 'ask', null, null, null, null, null, cv.title, null, cv.created_at, null
       from public.conversations cv, me
       where cv.user_id = me.uid and cv.deleted_at is null and cv.title is not null
         and cv.created_at > now() - interval '90 days'
       order by cv.created_at desc limit 30)
    union all
    (select 'report', rp.entity_id, null, null, null, null, null, null, rp.created_at, null
       from public.reports rp, me where rp.reporter_id = me.uid and rp.entity_type = 'post'
       order by rp.created_at desc limit 100)
  )
  select a.a, a.pid, coalesce(a.aid, p.author_id), coalesce(a.tid, p.topic_id), p.kind,
         coalesce(a.tool, p.tool_id), coalesce(a.model, p.model_id), a.term, a.v, a.at, a.pos
  from acts a
  left join public.posts p on p.id = a.pid and p.deleted_at is null
  where (select uid from me) is not null and a.a is not null
  order by a.at desc;
$function$;

revoke all on function public.my_feed_interests() from public, anon;
grant execute on function public.my_feed_interests() to authenticated, service_role;

/*
  feed_v3: what the people this person follows did with posts, as COUNTS per
  post, never identities (founder, 2026-09-25). Answers for auth.uid() only.

  Comments and reposts are public under the actor's own privacy
  (profile_shares), so they are counted one by one. Likes are private
  (likes_select_own): a like count is returned only when at least two followed
  people liked the post, so no single person's like can be inferred, and it is
  only ever used for ranking, never shown.

  p_post_ids null: the top posts by network engagement, as a retrieval source.
*/
CREATE FUNCTION public.my_network_engagement(p_post_ids uuid[] default null, p_days integer default 7)
 RETURNS TABLE(post_id uuid, likers integer, commenters integer, reposters integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with me as (select auth.uid() as uid),
  win as (select now() - make_interval(days => least(greatest(coalesce(p_days, 7), 1), 30)) as since),
  net as (
    select f.following_id as uid from public.follows f, me
    where f.follower_id = me.uid
    limit 1000
  ),
  ev as (
    select l.entity_id as pid, 'like'::text as k, l.user_id as actor
      from public.likes l join net on net.uid = l.user_id, win
      where l.entity_type = 'post' and l.created_at > win.since
    union all
    select c.post_id, 'comment', c.author_id
      from public.comments c join net on net.uid = c.author_id, win
      where c.deleted_at is null and c.status = 'visible' and c.created_at > win.since
        and public.profile_shares(c.author_id, 'replies')
    union all
    select r.post_id, 'repost', r.user_id
      from public.reposts r join net on net.uid = r.user_id, win
      where r.created_at > win.since
        and public.profile_shares(r.user_id, 'posts')
  ),
  agg as (
    select e.pid,
      count(distinct e.actor) filter (where e.k = 'like')::integer as l,
      count(distinct e.actor) filter (where e.k = 'comment')::integer as c,
      count(distinct e.actor) filter (where e.k = 'repost')::integer as r
    from ev e
    join public.posts p on p.id = e.pid
    where p.status = 'visible' and p.deleted_at is null
      and p.author_id <> (select uid from me)
      and (p_post_ids is null or e.pid = any (p_post_ids[1:500]))
    group by e.pid
  ),
  safe as (
    select a.pid, case when a.l >= 2 then a.l else 0 end as l, a.c, a.r from agg a
  )
  select s.pid, s.l, s.c, s.r
  from safe s
  where (select uid from me) is not null and (s.l + s.c + s.r) > 0
  order by (s.l + 1.5 * s.c + 1.5 * s.r) desc
  limit case when p_post_ids is null then 60 else 500 end;
$function$;

revoke all on function public.my_network_engagement(uuid[], integer) from public, anon;
grant execute on function public.my_network_engagement(uuid[], integer) to authenticated, service_role;
