-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260924115519. History: never edit.

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
    -- Explore and tool pages: a tool the person opened is interest in posts about it.
    (select 'explore', null, null, null, tv.tool_id, null, null, null, tv.created_at
       from public.tool_view_events tv, me
       where tv.user_id = me.uid and tv.tool_id is not null
         and tv.created_at > now() - interval '90 days'
       order by tv.created_at desc limit 50)
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
