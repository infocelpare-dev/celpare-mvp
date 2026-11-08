-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260918105147. History: never edit.

-- Profile privacy, founder instruction 2026-09-18.
--
-- Two things, and they are not the same thing.
--
--   is_private       the whole account. A stranger sees the picture, the name,
--                    the @username, the counts and a Follow button, and is told
--                    it is private. Nothing else.
--   show_*           one section at a time, for an account that is not private.
--
-- There is no follow request flow. Following a private account is allowed and
-- shows the follower nothing, because approval was not asked for and half an
-- approval system is worse than none. Recorded as a gap.
--
-- DEFAULTS PRESERVE TODAY'S BEHAVIOUR. Replies and follows are public now, so
-- they default true. Saved tools and models are owner only now, so they default
-- false. Nobody's profile changes the moment this lands, which is the only
-- honest default for a privacy column: it must never publish something that was
-- private before somebody asked for it.

alter table public.profiles
  add column if not exists is_private        boolean not null default false,
  add column if not exists show_replies      boolean not null default true,
  add column if not exists show_follows      boolean not null default true,
  add column if not exists show_saved_tools  boolean not null default false,
  add column if not exists show_saved_models boolean not null default false;

-- profiles is granted column by column, and a new column on an existing table
-- inherits nothing. Granted explicitly, and readable by anon because the
-- rendering decision "is this account private" has to be made for a signed out
-- visitor too. UPDATE is authenticated only; a policy still decides whose row.
grant select (is_private, show_replies, show_follows, show_saved_tools, show_saved_models)
  on public.profiles to anon, authenticated;
grant update (is_private, show_replies, show_follows, show_saved_tools, show_saved_models)
  on public.profiles to authenticated;

-- ---------------------------------------------------------------- the helper
--
-- One definition of "may this viewer see this section of this person", the way
-- is_active_account() is the one definition of "may this account act".
--
-- SECURITY DEFINER so it can read is_private without depending on the caller
-- holding a grant, and so a policy that calls it cannot recurse back into
-- profiles' own RLS.
--
-- Unknown section returns false. A privacy check fails closed, unlike a feature
-- flag, which D80 has already settled fails open: a flag decides whether a door
-- is open to everybody, this decides who may look.
create or replace function public.profile_shares(p_owner uuid, p_section text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when p_owner is null then false
    -- Your own everything, always. Without this branch a private account could
    -- not read its own posts back, and the owner-only tabs would empty out.
    when p_owner = (select auth.uid()) then true
    else coalesce((
      select (not p.is_private)
         and case p_section
               when 'posts'   then true
               when 'replies' then p.show_replies
               when 'follows' then p.show_follows
               when 'tools'   then p.show_saved_tools
               when 'models'  then p.show_saved_models
               else false
             end
      from public.profiles p
      where p.id = p_owner
    ), false)
  end;
$$;

revoke all on function public.profile_shares(uuid, text) from public;
grant execute on function public.profile_shares(uuid, text) to anon, authenticated;

-- ------------------------------------------------------------------ policies
--
-- Each of these keeps everything it already said and adds the privacy test.
-- The moderator branch is untouched: moderation cannot be opted out of by
-- making an account private, or a report would become unanswerable.

drop policy if exists posts_select_anon on public.posts;
create policy posts_select_anon on public.posts
  for select to anon
  using (
    status = 'visible'
    and deleted_at is null
    and public.profile_shares(author_id, 'posts')
  );

drop policy if exists posts_select_auth on public.posts;
create policy posts_select_auth on public.posts
  for select to authenticated
  using (
    (
      status = 'visible'
      and deleted_at is null
      and public.profile_shares(author_id, 'posts')
    )
    or (select auth.uid()) = author_id
    or public.is_moderator()
  );

drop policy if exists comments_select_anon on public.comments;
create policy comments_select_anon on public.comments
  for select to anon
  using (
    status = 'visible'
    and deleted_at is null
    and public.profile_shares(author_id, 'replies')
    and exists (
      select 1 from public.posts p
      where p.id = comments.post_id
        and p.status = 'visible'
        and p.deleted_at is null
    )
  );

drop policy if exists comments_select_auth on public.comments;
create policy comments_select_auth on public.comments
  for select to authenticated
  using (
    (
      status = 'visible'
      and deleted_at is null
      and public.profile_shares(author_id, 'replies')
      and exists (
        select 1 from public.posts p
        where p.id = comments.post_id
          and p.status = 'visible'
          and p.deleted_at is null
      )
    )
    or (select auth.uid()) = author_id
    or public.is_moderator()
  );

-- A repost is a public act by the reposter, so it follows the reposter's own
-- privacy rather than the original author's.
drop policy if exists reposts_select_all on public.reposts;
create policy reposts_select_all on public.reposts
  for select to anon, authenticated
  using (public.profile_shares(user_id, 'posts'));

-- A follow row names two people and either of them may have hidden their
-- connections, so it takes both agreeing. Either party can always see their own
-- rows, which is what keeps the Follow button's own state readable.
drop policy if exists follows_select_all on public.follows;
create policy follows_select_all on public.follows
  for select to anon, authenticated
  using (
    (select auth.uid()) in (follower_id, following_id)
    or (
      public.profile_shares(follower_id,  'follows')
      and public.profile_shares(following_id, 'follows')
    )
  );
