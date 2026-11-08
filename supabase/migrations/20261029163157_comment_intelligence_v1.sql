-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20261029163157. History: never edit.

-- Comment Intelligence v1 (comment_intelligence_v1, guide 20). Additive only.

create table public.comment_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  session_id text check (session_id is null or char_length(session_id) between 8 and 64),
  post_id uuid not null references public.posts(id) on delete cascade,
  comment_id uuid not null references public.comments(id) on delete cascade,
  event text not null check (event in ('impression', 'like', 'unlike', 'reply', 'hide', 'not_interested', 'report')),
  mode text check (mode is null or mode in ('top', 'following', 'newest')),
  position smallint check (position is null or position between 0 and 500),
  depth smallint check (depth is null or depth between 0 and 200),
  algorithm text check (algorithm is null or algorithm ~ '^[a-z]+(_[a-z]+)*_v[0-9]+$'),
  reason text check (reason is null or reason ~ '^[a-z_]{1,40}$'),
  created_at timestamptz not null default now()
);

alter table public.comment_events enable row level security;
revoke all on public.comment_events from anon, authenticated;

create index comment_events_user_recent on public.comment_events (user_id, created_at desc) where user_id is not null;
create index comment_events_comment on public.comment_events (comment_id, event);
create index comment_events_feedback on public.comment_events (user_id, comment_id) where event in ('hide', 'not_interested');

create index comments_root_newest_idx on public.comments (post_id, created_at desc, id desc)
  where parent_id is null and deleted_at is null;

create type public.comment_rank_row as (
  id uuid, parent_id uuid, author_id uuid, body text, created_at timestamptz, like_count int, status text,
  report_count int, qualified_report_count int,
  author_username text, author_full_name text, author_avatar_url text, author_status text,
  is_post_author boolean,
  trusted_likes int, new_account_likes int, early_likes int, likes_24h int,
  post_author_liked boolean, viewer_liked boolean,
  reply_count int, meaningful_replies int, distinct_repliers int, post_author_replied boolean,
  viewer_follows boolean, follows_viewer boolean,
  viewer_liked_author int, viewer_replied_author int, author_replied_viewer int,
  viewer_hid boolean, viewer_not_interested_author int
);

create or replace function public.comment_rank_features(
  p_viewer uuid, p_moderator boolean, p_post uuid, p_ids uuid[]
) returns setof public.comment_rank_row
language sql stable security definer set search_path = '' as $$
  with post as (
    select p.id, p.author_id, (p.status = 'visible' and p.deleted_at is null) as open
      from public.posts p where p.id = p_post
  ),
  c as (
    select c.* from public.comments c, post
     where c.post_id = p_post
       and c.id = any(coalesce(p_ids, '{}'))
       and c.deleted_at is null
       and (
         (c.status = 'visible' and post.open and public.profile_shares(c.author_id, 'replies'))
         or (p_viewer is not null and c.author_id = p_viewer)
         or coalesce(p_moderator, false)
       )
       and not exists (
         select 1 from public.feed_feedback f
          where p_viewer is not null and f.user_id = p_viewer and f.target_type = 'author'
            and f.kind = 'mute' and f.target_id = c.author_id and c.author_id <> p_viewer
       )
  ),
  lk as (
    select l.entity_id as cid,
      count(*) filter (where l.user_id <> c.author_id
        and coalesce(pr.created_at, l.created_at) <= l.created_at - interval '7 days')::int as trusted,
      count(*) filter (where l.user_id <> c.author_id
        and coalesce(pr.created_at, l.created_at) > l.created_at - interval '7 days')::int as fresh,
      count(*) filter (where l.user_id <> c.author_id
        and l.created_at <= c.created_at + interval '15 minutes')::int as early,
      count(*) filter (where l.user_id <> c.author_id
        and l.created_at > now() - interval '24 hours')::int as day,
      coalesce(bool_or(l.user_id = post.author_id and post.author_id <> c.author_id), false) as by_post_author,
      coalesce(bool_or(p_viewer is not null and l.user_id = p_viewer), false) as by_me
    from c
    join public.likes l on l.entity_type = 'comment' and l.entity_id = c.id
    left join public.profiles pr on pr.id = l.user_id
    cross join post
    group by l.entity_id
  ),
  rp as (
    select k.parent_id as cid,
      count(*)::int as n,
      count(*) filter (where k.author_id <> c.author_id and char_length(k.body) >= 20)::int as meaningful,
      (count(distinct k.author_id) filter (where k.author_id <> c.author_id))::int as people,
      coalesce(bool_or(k.author_id = post.author_id and post.author_id <> c.author_id), false) as by_post_author
    from c
    join public.comments k on k.parent_id = c.id and k.deleted_at is null and k.status = 'visible'
    cross join post
    group by k.parent_id
  ),
  authors as (
    select distinct c.author_id from c where p_viewer is not null and c.author_id <> p_viewer
  ),
  aff as (
    select a.author_id,
      exists (select 1 from public.follows f where f.follower_id = p_viewer and f.following_id = a.author_id) as i_follow,
      exists (select 1 from public.follows f where f.follower_id = a.author_id and f.following_id = p_viewer) as follows_me,
      (select count(*) from public.likes l
         left join public.posts p2 on l.entity_type = 'post' and p2.id = l.entity_id
         left join public.comments c2 on l.entity_type = 'comment' and c2.id = l.entity_id
        where l.user_id = p_viewer and l.created_at > now() - interval '90 days'
          and coalesce(p2.author_id, c2.author_id) = a.author_id)::int as liked,
      (select count(*) from public.comments mine
         join public.comments par on par.id = mine.parent_id
        where mine.author_id = p_viewer and mine.deleted_at is null
          and mine.created_at > now() - interval '90 days' and par.author_id = a.author_id)::int as replied,
      (select count(*) from public.comments theirs
         join public.comments par on par.id = theirs.parent_id
        where theirs.author_id = a.author_id and theirs.deleted_at is null
          and theirs.created_at > now() - interval '90 days' and par.author_id = p_viewer)::int as replied_me,
      (select count(*) from public.comment_events e
         join public.comments ec on ec.id = e.comment_id
        where e.user_id = p_viewer and e.event = 'not_interested' and ec.author_id = a.author_id)::int as not_interested
    from authors a
  )
  select
    c.id, c.parent_id, c.author_id, c.body, c.created_at, c.like_count, c.status,
    c.report_count, c.qualified_report_count,
    pr.username, pr.full_name, pr.avatar_url, pr.account_status,
    (c.author_id = post.author_id),
    coalesce(lk.trusted, 0), coalesce(lk.fresh, 0), coalesce(lk.early, 0), coalesce(lk.day, 0),
    coalesce(lk.by_post_author, false), coalesce(lk.by_me, false),
    coalesce(rp.n, 0), coalesce(rp.meaningful, 0), coalesce(rp.people, 0), coalesce(rp.by_post_author, false),
    coalesce(aff.i_follow, false), coalesce(aff.follows_me, false),
    coalesce(aff.liked, 0), coalesce(aff.replied, 0), coalesce(aff.replied_me, 0),
    exists (select 1 from public.comment_events e
             where p_viewer is not null and e.user_id = p_viewer and e.comment_id = c.id
               and e.event in ('hide', 'not_interested')),
    coalesce(aff.not_interested, 0)
  from c
  cross join post
  left join public.profiles pr on pr.id = c.author_id
  left join lk on lk.cid = c.id
  left join rp on rp.cid = c.id
  left join aff on aff.author_id = c.author_id;
$$;

create or replace function public.comment_rank_pool(
  p_viewer uuid, p_moderator boolean, p_post uuid, p_mode text,
  p_exclude uuid[] default '{}', p_before timestamptz default null,
  p_before_id uuid default null, p_limit int default 300
) returns setof public.comment_rank_row
language sql stable security definer set search_path = '' as $$
  with lim as (select least(greatest(coalesce(p_limit, 300), 1), 600) as n),
  roots as (
    select c.id, c.author_id, c.created_at, c.like_count
      from public.comments c
     where c.post_id = p_post and c.deleted_at is null
       and (c.parent_id is null or exists (
             select 1 from public.comments par
              where par.id = c.parent_id and (par.deleted_at is not null or par.status <> 'visible')))
       and not (c.id = any(coalesce(p_exclude, '{}')))
  ),
  followed as (
    select r.* from roots r
     where p_viewer is not null
       and exists (select 1 from public.follows f where f.follower_id = p_viewer and f.following_id = r.author_id)
  ),
  picked as (
    (select r.id from roots r, lim where p_mode = 'newest'
       and (p_before is null or p_before_id is null or (r.created_at, r.id) < (p_before, p_before_id))
     order by r.created_at desc, r.id desc limit (select n from lim))
    union
    (select r.id from followed r, lim where p_mode = 'following'
     order by r.created_at desc, r.id desc limit (select n from lim))
    union
    (select r.id from roots r, lim where p_mode = 'top'
     order by r.created_at desc, r.id desc limit (select n from lim))
    union
    (select r.id from roots r where p_mode = 'top'
     order by r.like_count desc, r.created_at desc, r.id desc limit 100)
    union
    (select r.id from followed r where p_mode = 'top'
     order by r.created_at desc, r.id desc limit 100)
    union
    (select r.id from roots r join public.posts p on p.id = p_post and p.author_id = r.author_id
      where p_mode = 'top' order by r.created_at desc, r.id desc limit 50)
    union
    (select r.id from roots r where p_mode = 'top' and p_viewer is not null and r.author_id = p_viewer
     order by r.created_at desc, r.id desc limit 20)
  )
  select * from public.comment_rank_features(p_viewer, p_moderator, p_post, array(select id from picked));
$$;

create or replace function public.comment_rank_replies(
  p_viewer uuid, p_moderator boolean, p_post uuid, p_roots uuid[], p_limit int default 400
) returns setof public.comment_rank_row
language sql stable security definer set search_path = '' as $$
  with recursive tree as (
    select c.id, (c.status = 'visible') as open, 1 as depth
      from public.comments c
     where c.post_id = p_post and c.parent_id = any(coalesce(p_roots, '{}')) and c.deleted_at is null
       and (c.status = 'visible' or c.author_id = p_viewer or coalesce(p_moderator, false))
    union all
    select c.id, (c.status = 'visible'), t.depth + 1
      from public.comments c
      join tree t on c.parent_id = t.id and t.open
     where c.deleted_at is null and t.depth < 200
       and (c.status = 'visible' or c.author_id = p_viewer or coalesce(p_moderator, false))
  ),
  capped as (
    select id from tree order by depth, id limit least(greatest(coalesce(p_limit, 400), 1), 1000)
  )
  select * from public.comment_rank_features(p_viewer, p_moderator, p_post, array(select id from capped));
$$;

revoke all on function public.comment_rank_features(uuid, boolean, uuid, uuid[]) from public, anon, authenticated;
revoke all on function public.comment_rank_pool(uuid, boolean, uuid, text, uuid[], timestamptz, uuid, int) from public, anon, authenticated;
revoke all on function public.comment_rank_replies(uuid, boolean, uuid, uuid[], int) from public, anon, authenticated;
grant execute on function public.comment_rank_features(uuid, boolean, uuid, uuid[]) to service_role;
grant execute on function public.comment_rank_pool(uuid, boolean, uuid, text, uuid[], timestamptz, uuid, int) to service_role;
grant execute on function public.comment_rank_replies(uuid, boolean, uuid, uuid[], int) to service_role;
