-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260915131606. History: never edit.

-- Phase 4Q.1. Suspension stops being a note in a table.
--
-- Before this migration public.profiles.account_status was read in exactly one
-- place, has_admin_capability(), so suspending a STAFF account removed its
-- capabilities and suspending an ordinary account removed nothing at all. A
-- moderator could suspend somebody with a reason and an end date, the audit log
-- would record it faithfully, and that person could keep posting.
--
-- One definition of "may this account act", used everywhere.

create or replace function public.is_active_account()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- No parameter, deliberately: it answers only for the caller, so it cannot be
  -- used to probe whether somebody else is suspended. Same shape as
  -- is_active_developer().
  --
  -- A suspension whose end date has passed is over. There is no scheduler on
  -- this platform, so expiry is evaluated on read rather than by a job that
  -- does not exist. account_status still reads 'suspended' until somebody
  -- clears it; the admin UI shows that as expired.
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and (
        p.account_status = 'active'
        or (
          p.account_status = 'suspended'
          and p.suspended_until is not null
          and p.suspended_until <= now()
        )
      )
  );
$$;

-- The default ACL hands EXECUTE on every new function to anon and authenticated
-- (G41). Revoke before granting, every time.
revoke all on function public.is_active_account() from public, anon, authenticated;
grant execute on function public.is_active_account() to anon, authenticated;

-- Staff now share the one definition, so an expired staff suspension lifts the
-- same way an ordinary one does. Previously this tested account_status =
-- 'active' directly and an expired suspension kept a moderator locked out until
-- somebody remembered to clear it.
create or replace function public.has_admin_capability(p_capability text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    join public.admin_capabilities c on c.role = p.role
    where p.id = (select auth.uid())
      and c.capability = p_capability
      and public.is_active_account()
  );
$$;

-- Publishing and public interaction. INSERT only, on purpose: UPDATE stays open
-- so a suspended person can still retract their own content. Today the only
-- UPDATE any of these surfaces performs is the soft delete. When post editing
-- ships, the edit path has to test this too.

drop policy if exists posts_insert_own on public.posts;
create policy posts_insert_own on public.posts
  for insert to authenticated
  with check ((select auth.uid()) = author_id and public.is_active_account());

drop policy if exists comments_insert_own on public.comments;
create policy comments_insert_own on public.comments
  for insert to authenticated
  with check (
    (select auth.uid()) = author_id
    and public.is_active_account()
    and exists (
      select 1 from public.posts p
      where p.id = comments.post_id and p.status = 'visible' and p.deleted_at is null
    )
  );

drop policy if exists likes_insert_own on public.likes;
create policy likes_insert_own on public.likes
  for insert to authenticated
  with check ((select auth.uid()) = user_id and public.is_active_account());

drop policy if exists reposts_insert_own on public.reposts;
create policy reposts_insert_own on public.reposts
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and public.is_active_account()
    and exists (
      select 1 from public.posts p
      where p.id = reposts.post_id and p.status = 'visible' and p.deleted_at is null
    )
  );

drop policy if exists follows_insert_own on public.follows;
create policy follows_insert_own on public.follows
  for insert to authenticated
  with check ((select auth.uid()) = follower_id and public.is_active_account());

-- Reporting is blocked too. It reads as harsh, and the alternative is worse:
-- D73 already treats coordinated reporting as the threat model, and a suspended
-- account filing reports is the cheapest way to aim the auto hide at somebody.
drop policy if exists reports_insert_own on public.reports;
create policy reports_insert_own on public.reports
  for insert to authenticated
  with check ((select auth.uid()) = reporter_id and public.is_active_account());

-- Developer submission. Folded into is_active_developer() rather than added to
-- each policy, because a suspended developer is not an active one by any
-- reading, and this way every future policy that calls it inherits the check.
create or replace function public.is_active_developer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.developer_profiles d
    where d.id = (select auth.uid())
      and d.accepted_terms_at is not null
  ) and public.is_active_account();
$$;
