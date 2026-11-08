-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260914091731. History: never edit.

-- Tracker task 4.6. RLS matrix from 10-community.md section 7, with three
-- deliberate departures recorded below.
--
-- Two rules applied throughout:
--   1. A policy whose TO list includes anon never calls is_moderator(),
--      because anon has no EXECUTE on it.
--   2. Anything a client must not write is ABSENT from the column grant. The
--      policy is not asked to carry that weight.

-- ===========================================================================
-- posts
-- ===========================================================================
create policy posts_select_public on public.posts
  for select to anon, authenticated
  using (status = 'visible' and deleted_at is null);

create policy posts_select_own on public.posts
  for select to authenticated
  using (auth.uid() = author_id);

create policy posts_select_moderator on public.posts
  for select to authenticated
  using (public.is_moderator());

create policy posts_insert_own on public.posts
  for insert to authenticated
  with check (auth.uid() = author_id);

-- USING carries deleted_at is null so a soft delete cannot be reversed by its
-- author. Undeleting is a moderator action through the RPC.
create policy posts_update_own on public.posts
  for update to authenticated
  using (auth.uid() = author_id and deleted_at is null)
  with check (auth.uid() = author_id);

-- DEPARTURE 1 from the spec matrix: there is no moderator UPDATE policy and no
-- DELETE policy for anybody. Moderation goes through moderate_set_status
-- below, because a moderator arrives as the authenticated Postgres role and a
-- column grant cannot tell them apart from any other signed in user. Granting
-- UPDATE (status) to moderators would grant it to everyone.

revoke all on public.posts from public, anon, authenticated;

-- report_count and qualified_report_count are withheld from clients: they
-- reveal how close an item is to auto hide, which is a probing aid.
grant select (
  id, author_id, body, link_url, topic_id,
  like_count, comment_count, save_count, repost_count,
  score, status, created_at, updated_at, deleted_at
) on public.posts to anon, authenticated;

-- Four columns. Everything else takes its default: id, all counters, score,
-- status and both timestamps.
grant insert (author_id, body, link_url, topic_id) on public.posts to authenticated;

-- Three editable fields and the soft delete. No status, no counters, no score.
grant update (body, link_url, topic_id, deleted_at) on public.posts to authenticated;

-- ===========================================================================
-- comments
-- ===========================================================================
-- DEPARTURE 2: the spec says "same shape as posts". Read literally that leaves
-- a comment on a hidden or removed post publicly readable through
-- /rest/v1/comments?post_id=eq.<hidden>, because the comment row carries its
-- own status. The bodies under a post removed for abuse are exactly the ones
-- you least want still served. The EXISTS fixes it: a comment is public only
-- when its post is. The subquery hits the posts primary key.
create policy comments_select_public on public.comments
  for select to anon, authenticated
  using (
    status = 'visible'
    and deleted_at is null
    and exists (
      select 1 from public.posts p
      where p.id = comments.post_id
        and p.status = 'visible'
        and p.deleted_at is null
    )
  );

create policy comments_select_own on public.comments
  for select to authenticated
  using (auth.uid() = author_id);

create policy comments_select_moderator on public.comments
  for select to authenticated
  using (public.is_moderator());

-- A comment may only be added to a post the author can actually see.
create policy comments_insert_own on public.comments
  for insert to authenticated
  with check (
    auth.uid() = author_id
    and exists (
      select 1 from public.posts p
      where p.id = comments.post_id
        and p.status = 'visible'
        and p.deleted_at is null
    )
  );

create policy comments_update_own on public.comments
  for update to authenticated
  using (auth.uid() = author_id and deleted_at is null)
  with check (auth.uid() = author_id);

revoke all on public.comments from public, anon, authenticated;

grant select (
  id, post_id, author_id, body, like_count, status,
  created_at, updated_at, deleted_at
) on public.comments to anon, authenticated;

grant insert (post_id, author_id, body) on public.comments to authenticated;
grant update (body, deleted_at) on public.comments to authenticated;

-- ===========================================================================
-- likes
-- ===========================================================================
-- anon gets nothing. The spec's "anon: select counts only, through the post
-- row" is already satisfied by posts.like_count, which anon can read. The
-- likes rows themselves stay private, so v1 exposes no "liked by" list.
create policy likes_select_own on public.likes
  for select to authenticated using (auth.uid() = user_id);

create policy likes_insert_own on public.likes
  for insert to authenticated with check (auth.uid() = user_id);

create policy likes_delete_own on public.likes
  for delete to authenticated using (auth.uid() = user_id);

revoke all on public.likes from public, anon, authenticated;
grant select (user_id, entity_type, entity_id, created_at) on public.likes to authenticated;
grant insert (user_id, entity_type, entity_id) on public.likes to authenticated;
grant delete on public.likes to authenticated;
-- No UPDATE grant: a like has nothing to edit, and unliking is a DELETE.
-- DELETE has no column granularity in Postgres, so the policy is the only
-- filter on that verb. That is the one place the policy carries the weight.

-- ===========================================================================
-- saves. THE TRAP.
-- ===========================================================================
-- One SELECT policy, scoped to the owner, TO authenticated only.
--
-- DEPARTURE 3: no anon policy, no cross user policy, and deliberately NO
-- moderator policy. The spec matrix says "saves: moderator all", but a
-- moderator reading everybody's bookmarks is the same leak wearing a badge.
-- A save creates no content, is visible to nobody and cannot be abusive, so
-- no moderation action requires it.
create policy saves_select_own on public.saves
  for select to authenticated using (auth.uid() = user_id);

create policy saves_insert_own on public.saves
  for insert to authenticated with check (auth.uid() = user_id);

create policy saves_delete_own on public.saves
  for delete to authenticated using (auth.uid() = user_id);

-- This revoke matters more here than anywhere else in the set. Without it the
-- Supabase default privileges leave anon holding SELECT on every bookmark.
revoke all on public.saves from public, anon, authenticated;
grant select (user_id, entity_type, entity_id, created_at) on public.saves to authenticated;
grant insert (user_id, entity_type, entity_id) on public.saves to authenticated;
grant delete on public.saves to authenticated;
-- anon is named in the revoke and appears in no grant on this table.

-- ===========================================================================
-- reports
-- ===========================================================================
create policy reports_insert_own on public.reports
  for insert to authenticated with check (auth.uid() = reporter_id);

create policy reports_select_own on public.reports
  for select to authenticated using (auth.uid() = reporter_id);

create policy reports_select_moderator on public.reports
  for select to authenticated using (public.is_moderator());

revoke all on public.reports from public, anon, authenticated;

grant select (
  id, reporter_id, entity_type, entity_id, reason, note, status,
  qualified, created_at
) on public.reports to authenticated;

-- status, qualified, resolved_by and resolved_at are absent: they default or
-- are set by the trigger, and resolution goes through the RPC.
grant insert (reporter_id, entity_type, entity_id, reason, note)
  on public.reports to authenticated;

-- No UPDATE grant at all, for anybody including moderators.
-- No DELETE grant: a report is a moderation record, resolved rather than erased.

-- ===========================================================================
-- Moderation RPCs.
-- These exist because a moderator is the authenticated Postgres role, so a
-- column grant cannot express moderator write privilege without handing it to
-- every signed in user. Routing moderation through SECURITY DEFINER functions
-- keeps status and every counter out of every client grant.
-- ===========================================================================
create or replace function public.moderate_set_status(
  p_entity_type text,
  p_entity_id   uuid,
  p_status      text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_moderator() then
    raise exception 'not_authorised' using errcode = '42501';
  end if;

  if p_status not in ('visible', 'hidden', 'removed') then
    raise exception 'invalid_status:%', p_status using errcode = '22023';
  end if;

  if p_entity_type = 'post' then
    update public.posts
       set status = p_status,
           -- Restoring an item clears the qualified counter, so the same
           -- reporters cannot immediately re-trip the threshold.
           qualified_report_count =
             case when p_status = 'visible' then 0 else qualified_report_count end,
           updated_at = now()
     where id = p_entity_id;
  elsif p_entity_type = 'comment' then
    update public.comments
       set status = p_status,
           qualified_report_count =
             case when p_status = 'visible' then 0 else qualified_report_count end,
           updated_at = now()
     where id = p_entity_id;
  else
    raise exception 'invalid_entity_type:%', p_entity_type using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.moderate_set_status(text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.moderate_set_status(text, uuid, text) to authenticated;

create or replace function public.moderate_resolve_report(
  p_report_id  uuid,
  p_resolution text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.reports;
begin
  if not public.is_moderator() then
    raise exception 'not_authorised' using errcode = '42501';
  end if;

  if p_resolution not in ('upheld', 'dismissed') then
    raise exception 'invalid_resolution:%', p_resolution using errcode = '22023';
  end if;

  select * into r from public.reports where id = p_report_id;
  if not found then
    raise exception 'report_not_found' using errcode = 'P0002';
  end if;

  -- Resolve every open report against the same item, not just this one.
  update public.reports
     set status = p_resolution,
         resolved_by = auth.uid(),
         resolved_at = now()
   where entity_type = r.entity_type
     and entity_id = r.entity_id
     and status = 'open';

  perform public.moderate_set_status(
    r.entity_type, r.entity_id,
    case when p_resolution = 'upheld' then 'removed' else 'visible' end);
end;
$$;

revoke all on function public.moderate_resolve_report(uuid, text)
  from public, anon, authenticated;
grant execute on function public.moderate_resolve_report(uuid, text) to authenticated;
