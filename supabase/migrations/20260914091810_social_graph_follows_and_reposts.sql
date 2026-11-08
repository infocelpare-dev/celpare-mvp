-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260914091810. History: never edit.

-- D69 and D70, founder instruction 2026-09-14. Overrides D28 for follows and
-- reposts only. Messaging stays deferred.

-- ---------------------------------------------------------------------------
-- Denormalised follow counters on profiles.
-- Readable by everyone, writable by nobody: they are simply never added to the
-- authenticated UPDATE grant.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column follower_count  integer not null default 0,
  add column following_count integer not null default 0;

alter table public.profiles
  add constraint profiles_follow_counts_ok
    check (follower_count >= 0 and following_count >= 0);

comment on column public.profiles.follower_count is
  'Maintained by tg_follows_count. Never client writable: absent from the UPDATE grant.';
comment on column public.profiles.following_count is
  'Maintained by tg_follows_count. Never client writable: absent from the UPDATE grant.';

grant select (follower_count, following_count) on public.profiles to anon, authenticated;

-- While we are here: avatar_url has never had a format CHECK, so it accepts
-- javascript: and data: URIs today. Every new profile surface renders it into
-- an <img src>, so it gets the same rule website_url gets below.
update public.profiles
   set avatar_url = null
 where avatar_url is not null
   and avatar_url !~ '^https?://[^[:space:]]+$';

alter table public.profiles
  add constraint profiles_avatar_url_ok check (
    avatar_url is null
    or (char_length(avatar_url) <= 2048 and avatar_url ~ '^https?://[^[:space:]]+$'));

-- ---------------------------------------------------------------------------
-- follows
-- ---------------------------------------------------------------------------
create table public.follows (
  follower_id  uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (follower_id, following_id),
  constraint follows_no_self check (follower_id <> following_id)
);

-- The primary key already answers "am I following these people". These two add
-- the recency orderings the profile page actually renders.
create index idx_follows_following_recent on public.follows (following_id, created_at desc);
create index idx_follows_follower_recent  on public.follows (follower_id, created_at desc);

create or replace function public.tg_follows_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.profiles set following_count = following_count + 1
     where id = new.follower_id;
    update public.profiles set follower_count = follower_count + 1
     where id = new.following_id;
    return new;
  end if;

  -- On a cascade from a deleted profile one of these matches zero rows,
  -- because that profile is already gone. Correct and harmless.
  update public.profiles set following_count = greatest(following_count - 1, 0)
   where id = old.follower_id;
  update public.profiles set follower_count = greatest(follower_count - 1, 0)
   where id = old.following_id;
  return old;
end;
$$;

revoke all on function public.tg_follows_count() from public, anon, authenticated;

create trigger follows_count_maintain
  after insert or delete on public.follows
  for each row execute function public.tg_follows_count();

alter table public.follows enable row level security;

-- The social graph is public, deliberately the opposite of saves. Who you
-- follow is a published signal rendered on a public profile. What you
-- bookmarked is rendered nowhere but your own account.
create policy follows_select_all on public.follows
  for select to anon, authenticated using (true);

create policy follows_insert_own on public.follows
  for insert to authenticated with check (auth.uid() = follower_id);

create policy follows_delete_own on public.follows
  for delete to authenticated using (auth.uid() = follower_id);

revoke all on public.follows from public, anon, authenticated;
grant select (follower_id, following_id, created_at) on public.follows to anon, authenticated;
grant insert (follower_id, following_id) on public.follows to authenticated;
grant delete on public.follows to authenticated;
-- No UPDATE grant. A follow has no editable field. Unfollow is a DELETE and
-- refollowing is idempotent through the primary key.

-- ---------------------------------------------------------------------------
-- reposts
--
-- A separate table rather than a nullable posts.reposted_from_id. The decisive
-- reason is soft delete. With a column, the repost is its own posts row with
-- its own deleted_at, so the feed filter tests the REPOST's columns and a
-- deleted or moderated original keeps circulating through every repost until
-- somebody remembers to add a self join onto the original. A moderation filter
-- you have to remember is a moderation filter that fails.
--
-- With a separate table the repost row carries no body at all, so nothing can
-- render it without joining posts, which makes the eligibility filter on the
-- original structural rather than remembered. The join you cannot forget beats
-- the join you can.
--
-- The cost is a union in the feed. It is paid once, in the view below.
-- ---------------------------------------------------------------------------
create table public.reposts (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  post_id    uuid not null references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

create index idx_reposts_user_recent on public.reposts (user_id, created_at desc);
create index idx_reposts_post on public.reposts (post_id);

create or replace function public.tg_reposts_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set repost_count = repost_count + 1 where id = new.post_id;
    return new;
  end if;
  update public.posts
     set repost_count = greatest(repost_count - 1, 0) where id = old.post_id;
  return old;
end;
$$;

revoke all on function public.tg_reposts_count() from public, anon, authenticated;

create trigger reposts_count_maintain
  after insert or delete on public.reposts
  for each row execute function public.tg_reposts_count();

alter table public.reposts enable row level security;

create policy reposts_select_all on public.reposts
  for select to anon, authenticated using (true);

-- You may only repost a post you can see. This EXISTS is what stops a repost
-- being used to resurface a hidden or removed post.
create policy reposts_insert_own on public.reposts
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.posts p
      where p.id = reposts.post_id
        and p.status = 'visible'
        and p.deleted_at is null
    )
  );

create policy reposts_delete_own on public.reposts
  for delete to authenticated using (auth.uid() = user_id);

revoke all on public.reposts from public, anon, authenticated;
grant select (user_id, post_id, created_at) on public.reposts to anon, authenticated;
grant insert (user_id, post_id) on public.reposts to authenticated;
grant delete on public.reposts to authenticated;
-- Un-reposting is a real DELETE. "Never hard delete user content" protects
-- authored words, and a repost row contains none. It is an unlike by another
-- name.

-- ---------------------------------------------------------------------------
-- The union, paid for once, so no caller writes it by hand.
--
-- security_invoker = true is not optional: without it the view runs as its
-- owner and every underlying RLS policy is bypassed.
--
-- The repost branch joins posts and filters the ORIGINAL's status and
-- deleted_at. That filter is unavoidable here, which is the whole argument for
-- this shape over a nullable column.
-- ---------------------------------------------------------------------------
create view public.community_feed_items
with (security_invoker = true) as
  select
    'post'::text as item_kind,
    p.author_id  as actor_id,
    p.id         as post_id,
    p.created_at as item_at,
    p.score      as item_score
  from public.posts p
  where p.deleted_at is null
    and p.status = 'visible'
  union all
  select
    'repost'::text,
    r.user_id,
    r.post_id,
    r.created_at,
    p.score
  from public.reposts r
  join public.posts p on p.id = r.post_id
  where p.deleted_at is null
    and p.status = 'visible';

comment on view public.community_feed_items is
  'Feed candidate rows. Key is (item_kind, actor_id, post_id). Join posts for
   the body. security_invoker is on, so caller RLS still applies.';

revoke all on public.community_feed_items from public, anon, authenticated;
grant select on public.community_feed_items to anon, authenticated;
