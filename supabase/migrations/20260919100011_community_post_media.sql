-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260919100011. History: never edit.

-- Images and video on a post.
--
-- Its own table rather than columns, because a post carries up to four images
-- and ordering matters. 10-community.md deferred this as G20 wanting "a
-- Storage bucket, size limits, a moderation path and a CDN answer". Three of
-- those now exist: the buckets and caps below mirror the ones 4X built for
-- tool media, and the moderation path is the report and auto hide built in
-- 4.15, which hides a post and therefore its media at three qualified reports.
-- Retention after a soft delete is still open and is recorded as a gap.

create table public.post_media (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.posts(id) on delete cascade,
  media_kind  text not null,
  url         text not null,
  -- Supplied by the browser that uploaded it, so the card can reserve the
  -- right box and the feed does not jump as images load.
  width       integer,
  height      integer,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  constraint post_media_kind_ok check (media_kind in ('image','video')),
  constraint post_media_url_ok  check (char_length(url) <= 2048 and url ~ '^https://'),
  constraint post_media_dims_ok check (
    (width is null or width between 1 and 20000) and
    (height is null or height between 1 and 20000)
  )
);

create index post_media_post_idx on public.post_media (post_id, sort_order);

-- REVOKE BEFORE GRANT. A new table in public is granted arwdDxtm to anon and
-- authenticated by pg_default_acl, every time. G41 records that the default
-- ACL itself is still there, so this is done by hand on every new table.
revoke all on public.post_media from anon, authenticated, public;

grant select (id, post_id, media_kind, url, width, height, sort_order, created_at)
  on public.post_media to anon, authenticated;
grant insert (post_id, media_kind, url, width, height, sort_order)
  on public.post_media to authenticated;
grant delete on public.post_media to authenticated;

alter table public.post_media enable row level security;

-- Visibility follows the parent post exactly, including profile_shares. A
-- media row is never more visible than the post it belongs to.
create policy post_media_select_anon on public.post_media
  for select to anon
  using (exists (
    select 1 from public.posts p
    where p.id = post_media.post_id
      and p.status = 'visible'
      and p.deleted_at is null
      and public.profile_shares(p.author_id, 'posts')
  ));

create policy post_media_select_auth on public.post_media
  for select to authenticated
  using (exists (
    select 1 from public.posts p
    where p.id = post_media.post_id
      and (
        (p.status = 'visible' and p.deleted_at is null
           and public.profile_shares(p.author_id, 'posts'))
        or p.author_id = (select auth.uid())
        or public.is_moderator()
      )
  ));

create policy post_media_insert_own on public.post_media
  for insert to authenticated
  with check (
    public.is_active_account()
    and exists (
      select 1 from public.posts p
      where p.id = post_media.post_id
        and p.author_id = (select auth.uid())
    )
  );

create policy post_media_delete_own on public.post_media
  for delete to authenticated
  using (exists (
    select 1 from public.posts p
    where p.id = post_media.post_id
      and p.author_id = (select auth.uid())
  ));

-- The cap, in the database rather than only in the action, because the action
-- is not the control. Four images, or one video and nothing else.
create or replace function public.tg_post_media_cap()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  existing  integer;
  has_video boolean;
begin
  select count(*), coalesce(bool_or(media_kind = 'video'), false)
    into existing, has_video
    from public.post_media
   where post_id = new.post_id;

  if new.media_kind = 'video' then
    if existing > 0 then
      raise exception 'a post carries one video and nothing else'
        using errcode = '23514';
    end if;
  else
    if has_video then
      raise exception 'a post carries one video and nothing else'
        using errcode = '23514';
    end if;
    if existing >= 4 then
      raise exception 'a post carries at most four images'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

-- EXECUTE on a new function is granted to anon and authenticated by the same
-- default ACL. A trigger function is called by the trigger machinery, not by
-- the caller, so revoking costs nothing and closes the same advisor finding
-- the counter triggers were cleaned up for in 4.5.
revoke all on function public.tg_post_media_cap() from anon, authenticated, public;

create trigger post_media_cap
  before insert on public.post_media
  for each row execute function public.tg_post_media_cap();
