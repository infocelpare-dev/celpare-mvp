-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260925122156. History: never edit.

-- 4BH Notifications. docs/context/14-notifications.md, D147.
-- No table grants at all: every read and write goes through a definer function
-- that checks auth.uid(), so there is no column grant to get wrong (rule 12).

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('like', 'comment', 'reply', 'repost', 'follow', 'friend',
    'mention', 'post_milestone', 'post_lifecycle')),
  actor_id uuid references public.profiles(id) on delete set null,
  actor_ids uuid[] not null default '{}',
  actor_count integer not null default 0,
  post_id uuid references public.posts(id) on delete cascade,
  comment_id uuid references public.comments(id) on delete cascade,
  group_key text,
  data jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  read_at timestamptz
);
create unique index notifications_group_idx on public.notifications (recipient_id, group_key) where group_key is not null;
create index notifications_recipient_idx on public.notifications (recipient_id, updated_at desc);
create index notifications_unread_idx on public.notifications (recipient_id) where read_at is null;

create table public.notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  likes boolean not null default true,
  comments boolean not null default true,
  replies boolean not null default true,
  reposts boolean not null default true,
  follows boolean not null default true,
  mentions boolean not null default true,
  performance boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;
revoke all on public.notifications from public, anon, authenticated;
revoke all on public.notification_preferences from public, anon, authenticated;

alter table public.post_state add column notified_rank smallint not null default 0;

-- Which preference switch governs a kind.
create or replace function public.notification_pref_column(p_kind text)
returns text language sql immutable set search_path = pg_catalog as $$
  select case p_kind
    when 'like' then 'likes' when 'comment' then 'comments' when 'reply' then 'replies'
    when 'repost' then 'reposts' when 'follow' then 'follows' when 'friend' then 'follows'
    when 'mention' then 'mentions' else 'performance' end;
$$;

/*
  The one writer. Every rule lives here: never to yourself, never from somebody
  the recipient muted, never a kind they switched off (not written at all), and
  grouping: a second like on the same post the same day joins the first row,
  moves it to the top and makes it unread again.
*/
create or replace function public.notify(
  p_recipient uuid, p_kind text, p_actor uuid, p_post uuid, p_comment uuid,
  p_group_key text, p_data jsonb default '{}')
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_on boolean;
begin
  if p_recipient is null or p_recipient = p_actor then return; end if;

  if p_actor is not null and exists (
    select 1 from public.feed_feedback fb
    where fb.user_id = p_recipient and fb.target_type = 'author' and fb.kind = 'mute' and fb.target_id = p_actor
  ) then return; end if;

  execute format('select %I from public.notification_preferences where user_id = $1',
                 public.notification_pref_column(p_kind))
    into v_on using p_recipient;
  if v_on is false then return; end if;

  if p_group_key is null then
    insert into public.notifications (recipient_id, kind, actor_id, actor_ids, actor_count, post_id, comment_id, data)
    values (p_recipient, p_kind, p_actor, case when p_actor is null then '{}' else array[p_actor] end,
            case when p_actor is null then 0 else 1 end, p_post, p_comment, coalesce(p_data, '{}'));
  else
    insert into public.notifications as n (recipient_id, kind, actor_id, actor_ids, actor_count, post_id, comment_id, group_key, data)
    values (p_recipient, p_kind, p_actor, case when p_actor is null then '{}' else array[p_actor] end,
            case when p_actor is null then 0 else 1 end, p_post, p_comment, p_group_key, coalesce(p_data, '{}'))
    on conflict (recipient_id, group_key) where group_key is not null do update set
      actor_id = excluded.actor_id,
      actor_ids = (array[excluded.actor_id] || array_remove(n.actor_ids, excluded.actor_id))[1:20],
      actor_count = n.actor_count + case when excluded.actor_id = any (n.actor_ids) then 0 else 1 end,
      comment_id = coalesce(excluded.comment_id, n.comment_id),
      data = n.data || excluded.data,
      updated_at = now(),
      read_at = null;
  end if;
end $$;

-- Social producers.
create or replace function public.tg_notify_like()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_author uuid;
begin
  if new.entity_type <> 'post' then return new; end if;
  select author_id into v_author from public.posts where id = new.entity_id and deleted_at is null;
  perform public.notify(v_author, 'like', new.user_id, new.entity_id, null,
    'like:' || new.entity_id || ':' || to_char(new.created_at at time zone 'utc', 'YYYY-MM-DD'),
    jsonb_build_object('day', to_char(new.created_at at time zone 'utc', 'YYYY-MM-DD')));
  return new;
end $$;

create or replace function public.tg_notify_comment()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_post_author uuid;
  v_parent_author uuid;
  v_day text := to_char(new.created_at at time zone 'utc', 'YYYY-MM-DD');
begin
  if new.status <> 'visible' or new.deleted_at is not null then return new; end if;
  select author_id into v_post_author from public.posts where id = new.post_id and deleted_at is null;
  if new.parent_id is not null then
    select author_id into v_parent_author from public.comments where id = new.parent_id and deleted_at is null;
    perform public.notify(v_parent_author, 'reply', new.author_id, new.post_id, new.parent_id,
      'reply:' || new.parent_id || ':' || v_day, jsonb_build_object('day', v_day, 'latest_comment', new.id));
  end if;
  -- The post's author hears about a comment, unless they are the one being
  -- replied to (they already got the reply).
  if v_post_author is distinct from v_parent_author then
    perform public.notify(v_post_author, 'comment', new.author_id, new.post_id, new.id,
      'comment:' || new.post_id || ':' || v_day, jsonb_build_object('day', v_day));
  end if;
  return new;
end $$;

create or replace function public.tg_notify_repost()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_author uuid;
begin
  select author_id into v_author from public.posts where id = new.post_id and deleted_at is null;
  perform public.notify(v_author, 'repost', new.user_id, new.post_id, null,
    'repost:' || new.post_id || ':' || to_char(new.created_at at time zone 'utc', 'YYYY-MM-DD'),
    jsonb_build_object('day', to_char(new.created_at at time zone 'utc', 'YYYY-MM-DD')));
  return new;
end $$;

-- A follow back is a friendship (D123): one "friend" notice, not a follow.
create or replace function public.tg_notify_follow()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_day text := to_char(new.created_at at time zone 'utc', 'YYYY-MM-DD');
begin
  if exists (select 1 from public.follows f where f.follower_id = new.following_id and f.following_id = new.follower_id) then
    perform public.notify(new.following_id, 'friend', new.follower_id, null, null, null, '{}');
  else
    perform public.notify(new.following_id, 'follow', new.follower_id, null, null,
      'follow:' || v_day, jsonb_build_object('day', v_day));
  end if;
  return new;
end $$;

create or replace function public.tg_notify_mention()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_author uuid;
begin
  select author_id into v_author from public.posts where id = new.post_id;
  perform public.notify(new.user_id, 'mention', v_author, new.post_id, null, null, '{}');
  return new;
end $$;

create trigger notify_like after insert on public.likes for each row execute function public.tg_notify_like();
create trigger notify_comment after insert on public.comments for each row execute function public.tg_notify_comment();
create trigger notify_repost after insert on public.reposts for each row execute function public.tg_notify_repost();
create trigger notify_follow after insert on public.follows for each row execute function public.tg_notify_follow();
create trigger notify_mention after insert on public.post_mentions for each row execute function public.tg_notify_mention();

/*
  Performance notices, called by the tick for each post it measured. Lifecycle
  notices only move upward and at most three per post; a milestone fires once,
  and a post that jumps past several at once gets only the highest.
*/
create or replace function public.post_performance_notices(p_post uuid, p_stage text, p_views integer)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  s record;
  v_rank integer := coalesce(array_position(array['promising', 'accelerating', 'trending', 'viral'], p_stage), 0);
  v_milestone integer;
begin
  select ps.author_id, ps.notified_rank, ps.notices_sent, ps.milestones_sent into s
  from public.post_state ps where ps.post_id = p_post;
  if s.author_id is null then return; end if;

  if v_rank > s.notified_rank and s.notices_sent < 3 then
    perform public.notify(s.author_id, 'post_lifecycle', null, p_post, null, null, jsonb_build_object('stage', p_stage));
    update public.post_state set notified_rank = v_rank, notices_sent = notices_sent + 1 where post_id = p_post;
  end if;

  select max(m) into v_milestone from unnest(array[10, 100, 1000, 10000]) m
  where p_views >= m and not (m = any (s.milestones_sent));
  if v_milestone is not null then
    perform public.notify(s.author_id, 'post_milestone', null, p_post, null, null, jsonb_build_object('views', v_milestone));
    update public.post_state set milestones_sent = (select array_agg(m) from unnest(array[10, 100, 1000, 10000]) m where m <= v_milestone)
    where post_id = p_post;
  end if;
end $$;

-- Existing posts are not news: mark the milestones they have already passed.
update public.post_state s set milestones_sent = coalesce((select array_agg(m) from unnest(array[10, 100, 1000, 10000]) m
  where m <= p.view_count), '{}')
from public.posts p where p.id = s.post_id;

-- The page. Counts and actors are recomputed from the source rows, so an unlike
-- or an unfollow drops out; a group with nobody left is not shown. Post and
-- comment text are shown only where the recipient may read them.
create or replace function public.my_notifications(p_before timestamptz default null, p_limit integer default 30, p_kind text default null)
returns table(id uuid, kind text, updated_at timestamptz, read_at timestamptz, actor_count integer,
  actors jsonb, post_id uuid, post_excerpt text, post_kind text, comment_id uuid, comment_excerpt text, data jsonb)
language sql stable security definer set search_path = public, pg_temp as $$
  with me as (select auth.uid() uid),
  base as (
    select n.* from public.notifications n, me
    where n.recipient_id = me.uid
      and (p_before is null or n.updated_at < p_before)
      and (p_kind is null or n.kind = p_kind)
    order by n.updated_at desc
    limit least(greatest(coalesce(p_limit, 30), 1), 100) * 2
  ),
  checked as (
    select b.*, p.author_id post_author, p.body post_body, p.kind pkind,
      p.id is not null and p.deleted_at is null and p.status = 'visible'
        and (p.author_id = b.recipient_id or public.profile_shares(p.author_id, 'posts')) post_ok,
      c.body comment_body,
      c.id is not null and c.deleted_at is null and c.status = 'visible'
        and (c.author_id = b.recipient_id or public.profile_shares(c.author_id, 'replies')) comment_ok,
      v.ids valid_ids,
      case b.kind
        when 'like' then (select count(distinct l.user_id) from public.likes l
          where l.entity_type = 'post' and l.entity_id = b.post_id and l.user_id <> b.recipient_id
            and to_char(l.created_at at time zone 'utc', 'YYYY-MM-DD') = b.data->>'day')
        when 'repost' then (select count(distinct r.user_id) from public.reposts r
          where r.post_id = b.post_id and r.user_id <> b.recipient_id
            and to_char(r.created_at at time zone 'utc', 'YYYY-MM-DD') = b.data->>'day')
        when 'comment' then (select count(distinct cc.author_id) from public.comments cc
          where cc.post_id = b.post_id and cc.author_id <> b.recipient_id and cc.deleted_at is null
            and to_char(cc.created_at at time zone 'utc', 'YYYY-MM-DD') = b.data->>'day')
        when 'reply' then (select count(distinct cc.author_id) from public.comments cc
          where cc.parent_id = b.comment_id and cc.author_id <> b.recipient_id and cc.deleted_at is null
            and to_char(cc.created_at at time zone 'utc', 'YYYY-MM-DD') = b.data->>'day')
        when 'follow' then (select count(distinct f.follower_id) from public.follows f
          where f.following_id = b.recipient_id
            and to_char(f.created_at at time zone 'utc', 'YYYY-MM-DD') = b.data->>'day')
        else cardinality(v.ids)
      end::integer live_count
    from base b
    left join public.posts p on p.id = b.post_id
    left join public.comments c on c.id = b.comment_id
    cross join lateral (
      select coalesce(array_agg(x.uid order by x.ord), '{}') ids
      from unnest(b.actor_ids) with ordinality x(uid, ord)
      where not exists (select 1 from public.feed_feedback fb where fb.user_id = b.recipient_id
                          and fb.target_type = 'author' and fb.kind = 'mute' and fb.target_id = x.uid)
        and case b.kind
          when 'like' then exists (select 1 from public.likes l where l.user_id = x.uid and l.entity_type = 'post' and l.entity_id = b.post_id)
          when 'repost' then exists (select 1 from public.reposts r where r.user_id = x.uid and r.post_id = b.post_id)
          when 'follow' then exists (select 1 from public.follows f where f.follower_id = x.uid and f.following_id = b.recipient_id)
          when 'friend' then exists (select 1 from public.follows f where f.follower_id = x.uid and f.following_id = b.recipient_id)
                         and exists (select 1 from public.follows f where f.follower_id = b.recipient_id and f.following_id = x.uid)
          when 'comment' then exists (select 1 from public.comments cc where cc.author_id = x.uid and cc.post_id = b.post_id and cc.deleted_at is null)
          when 'reply' then exists (select 1 from public.comments cc where cc.author_id = x.uid and cc.parent_id = b.comment_id and cc.deleted_at is null)
          else true end
    ) v
  )
  select c.id, c.kind, c.updated_at, c.read_at,
    case when c.kind in ('post_milestone', 'post_lifecycle') then 0 else greatest(c.live_count, cardinality(c.valid_ids)) end,
    coalesce((select jsonb_agg(jsonb_build_object('id', pr.id, 'username', pr.username, 'full_name', pr.full_name,
                'avatar_url', pr.avatar_url) order by x.ord)
              from unnest(c.valid_ids[1:3]) with ordinality x(uid, ord) join public.profiles pr on pr.id = x.uid), '[]'::jsonb),
    c.post_id,
    case when c.post_ok then left(regexp_replace(c.post_body, '\s+', ' ', 'g'), 140) end,
    case when c.post_ok then c.pkind end,
    c.comment_id,
    case when c.comment_ok then left(regexp_replace(c.comment_body, '\s+', ' ', 'g'), 140) end,
    c.data
  from checked c
  where (c.post_id is null or c.post_ok)
    and (c.kind in ('post_milestone', 'post_lifecycle') or cardinality(c.valid_ids) > 0)
  order by c.updated_at desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;

create or replace function public.my_unread_notification_count()
returns integer language sql stable security definer set search_path = public, pg_temp as $$
  select least(count(*), 100)::integer from public.notifications n
  where n.recipient_id = auth.uid() and n.read_at is null;
$$;

create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare v_n integer;
begin
  if auth.uid() is null then return 0; end if;
  update public.notifications set read_at = now()
  where recipient_id = auth.uid() and read_at is null and (p_ids is null or id = any (p_ids[1:200]));
  get diagnostics v_n = row_count;
  return v_n;
end $$;

create or replace function public.my_notification_preferences()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select to_jsonb(p) - 'user_id' - 'updated_at' from public.notification_preferences p where p.user_id = auth.uid()),
    '{"likes": true, "comments": true, "replies": true, "reposts": true, "follows": true, "mentions": true, "performance": true}'::jsonb);
$$;

create or replace function public.set_notification_preference(p_key text, p_on boolean)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if p_key not in ('likes', 'comments', 'replies', 'reposts', 'follows', 'mentions', 'performance') then
    raise exception 'unknown_preference' using errcode = '22023';
  end if;
  insert into public.notification_preferences (user_id) values (auth.uid()) on conflict do nothing;
  execute format('update public.notification_preferences set %I = $1, updated_at = now() where user_id = $2', p_key)
    using p_on, auth.uid();
end $$;

-- Read notifications older than 90 days go, with the hourly job.
create or replace function public.notifications_housekeeping()
returns void language sql security definer set search_path = public, pg_temp as $$
  delete from public.notifications where read_at is not null and read_at < now() - interval '90 days';
$$;

revoke all on function public.notification_pref_column(text) from public, anon, authenticated;
revoke all on function public.notify(uuid, text, uuid, uuid, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.tg_notify_like() from public, anon, authenticated;
revoke all on function public.tg_notify_comment() from public, anon, authenticated;
revoke all on function public.tg_notify_repost() from public, anon, authenticated;
revoke all on function public.tg_notify_follow() from public, anon, authenticated;
revoke all on function public.tg_notify_mention() from public, anon, authenticated;
revoke all on function public.post_performance_notices(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.notifications_housekeeping() from public, anon, authenticated;
revoke all on function public.my_notifications(timestamptz, integer, text) from public, anon, authenticated;
revoke all on function public.my_unread_notification_count() from public, anon, authenticated;
revoke all on function public.mark_notifications_read(uuid[]) from public, anon, authenticated;
revoke all on function public.my_notification_preferences() from public, anon, authenticated;
revoke all on function public.set_notification_preference(text, boolean) from public, anon, authenticated;
grant execute on function public.my_notifications(timestamptz, integer, text) to authenticated;
grant execute on function public.my_unread_notification_count() to authenticated;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;
grant execute on function public.my_notification_preferences() to authenticated;
grant execute on function public.set_notification_preference(text, boolean) to authenticated;

-- The tick calls the performance notices for every post it measures.
do $$
declare d text;
begin
  d := pg_get_functiondef('public.post_intelligence_tick()'::regprocedure);
  d := replace(d, 's.metrics st_metrics, p.created_at, p.kind, p.topic_id,',
                  's.metrics st_metrics, p.created_at, p.kind, p.topic_id, p.view_count,');
  d := replace(d, E'    end if;\n  end loop;\n\n  return jsonb_build_object(''recovered''',
                  E'    end if;\n\n    perform public.post_performance_notices(r.post_id, n.stage, r.view_count);\n  end loop;\n\n  return jsonb_build_object(''recovered''');
  if position('post_performance_notices' in d) = 0 or position('p.view_count,' in d) = 0 then
    raise exception 'tick patch did not apply';
  end if;
  execute d;
end $$;
revoke all on function public.post_intelligence_tick() from public, anon, authenticated;

select cron.alter_job(
  (select jobid from cron.job where jobname = 'post-intelligence-baselines'),
  command := 'select public.refresh_creator_baselines(); select public.refresh_topic_velocity(); select public.post_intelligence_housekeeping(); select public.notifications_housekeeping();');
