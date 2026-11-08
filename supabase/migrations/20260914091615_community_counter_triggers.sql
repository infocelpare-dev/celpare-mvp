-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260914091615. History: never edit.

-- Tracker task 4.5.
--
-- Every function here is SECURITY DEFINER with a pinned search_path, the same
-- fix task 3.1 needed. SECURITY DEFINER is load bearing twice over: for the
-- search_path hardening, and because these functions UPDATE rows the calling
-- user does not own. Under the caller's RLS those updates would silently
-- affect zero rows and every counter would stay at zero forever.
--
-- Every function is then revoked from public, anon and authenticated, because
-- a SECURITY DEFINER function reachable over REST is a privilege escalation.
-- That is the other half of the task 3.1 advisor finding.
--
-- The counters themselves are kept out of every client grant in migration 5.
-- That, not the policy text, is what makes them unwritable.
--
-- Every decrement uses greatest(n - 1, 0) so a repair script or a manual fix
-- can never drive a counter negative and trip the CHECK constraints.

-- ---------------------------------------------------------------------------
-- like_count on posts and comments
-- ---------------------------------------------------------------------------
create or replace function public.tg_likes_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.entity_type = 'post' then
      update public.posts set like_count = like_count + 1 where id = new.entity_id;
    else
      update public.comments set like_count = like_count + 1 where id = new.entity_id;
    end if;
    return new;
  end if;

  if old.entity_type = 'post' then
    update public.posts
       set like_count = greatest(like_count - 1, 0) where id = old.entity_id;
  else
    update public.comments
       set like_count = greatest(like_count - 1, 0) where id = old.entity_id;
  end if;
  return old;
end;
$$;

revoke all on function public.tg_likes_count() from public, anon, authenticated;

create trigger likes_count_maintain
  after insert or delete on public.likes
  for each row execute function public.tg_likes_count();

-- ---------------------------------------------------------------------------
-- save_count on posts
-- ---------------------------------------------------------------------------
create or replace function public.tg_saves_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set save_count = save_count + 1 where id = new.entity_id;
    return new;
  end if;
  update public.posts
     set save_count = greatest(save_count - 1, 0) where id = old.entity_id;
  return old;
end;
$$;

revoke all on function public.tg_saves_count() from public, anon, authenticated;

create trigger saves_count_maintain
  after insert or delete on public.saves
  for each row execute function public.tg_saves_count();

-- ---------------------------------------------------------------------------
-- comment_count on posts.
--
-- Not the simple counter the spec implies. A comment is countable when it is
-- visible and not soft deleted, so this must fire on soft delete and on a
-- moderation status change as well as on insert. Otherwise a post whose
-- comments were all removed keeps advertising them.
-- ---------------------------------------------------------------------------
create or replace function public.tg_comments_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_post   uuid;
  was_countable boolean := false;
  is_countable  boolean := false;
begin
  if tg_op = 'DELETE' then
    target_post := old.post_id;
  else
    target_post := new.post_id;
  end if;

  if tg_op in ('UPDATE', 'DELETE') then
    was_countable := (old.deleted_at is null and old.status = 'visible');
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    is_countable := (new.deleted_at is null and new.status = 'visible');
  end if;

  if is_countable and not was_countable then
    update public.posts set comment_count = comment_count + 1 where id = target_post;
  elsif was_countable and not is_countable then
    update public.posts
       set comment_count = greatest(comment_count - 1, 0) where id = target_post;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.tg_comments_count() from public, anon, authenticated;

create trigger comments_count_maintain
  after insert or delete or update of deleted_at, status on public.comments
  for each row execute function public.tg_comments_count();

-- ---------------------------------------------------------------------------
-- report_count, qualified_report_count, and the D33 auto hide as amended by D73.
--
-- report_count is the honest raw total of every report filed.
-- qualified_report_count is the only thing that moves the threshold, and a
-- report qualifies only when the reporter's account is old enough and has a
-- confirmed email. Three throwaway accounts made this morning now do nothing.
--
-- Content authored by a moderator, admin or super admin is exempt from auto
-- hide entirely. At zero users that protects the only content that exists.
--
-- Known gap: 10-community.md section 10 promises the author is notified on
-- auto hide. There is no notifications table (deferred by D28), so today the
-- author is hidden silently. Logged rather than assumed working.
-- ---------------------------------------------------------------------------
create or replace function public.tg_reports_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  threshold     integer := public.report_hide_threshold();
  min_age_hours integer := public.report_min_account_age_hours();
  target_author uuid;
  is_qualified  boolean := false;
  author_exempt boolean := false;
begin
  -- Who wrote the thing being reported.
  if new.entity_type = 'post' then
    select author_id into target_author from public.posts where id = new.entity_id;
  else
    select author_id into target_author from public.comments where id = new.entity_id;
  end if;

  if target_author is null then
    -- Reported something that does not exist. Record the report, change nothing.
    return new;
  end if;

  select exists (
    select 1 from auth.users u
    where u.id = new.reporter_id
      and u.created_at < now() - make_interval(hours => min_age_hours)
      and u.email_confirmed_at is not null
  ) into is_qualified;

  select exists (
    select 1 from public.profiles a
    where a.id = target_author
      and a.role in ('moderator', 'admin', 'super_admin')
  ) into author_exempt;

  if author_exempt then
    is_qualified := false;
  end if;

  -- Recorded on the report row so a moderator can see which ones counted.
  new.qualified := is_qualified;

  -- report_count + 1 is correct inside a single UPDATE: every expression in
  -- the SET list sees the pre update row.
  if new.entity_type = 'post' then
    update public.posts
       set report_count = report_count + 1,
           qualified_report_count =
             qualified_report_count + (case when is_qualified then 1 else 0 end),
           status = case
                      when is_qualified
                       and qualified_report_count + 1 >= threshold
                       and status = 'visible'
                      then 'hidden' else status
                    end
     where id = new.entity_id;
  else
    -- Auto hiding a comment flips its status, which fires
    -- comments_count_maintain, which decrements the post's comment_count.
    -- The two triggers compose on purpose.
    update public.comments
       set report_count = report_count + 1,
           qualified_report_count =
             qualified_report_count + (case when is_qualified then 1 else 0 end),
           status = case
                      when is_qualified
                       and qualified_report_count + 1 >= threshold
                       and status = 'visible'
                      then 'hidden' else status
                    end
     where id = new.entity_id;
  end if;

  return new;
end;
$$;

revoke all on function public.tg_reports_count() from public, anon, authenticated;

-- BEFORE INSERT, because it writes new.qualified onto the row being inserted.
create trigger reports_count_maintain
  before insert on public.reports
  for each row execute function public.tg_reports_count();
