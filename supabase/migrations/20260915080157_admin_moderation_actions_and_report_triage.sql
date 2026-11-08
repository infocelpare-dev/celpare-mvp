-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260915080157. History: never edit.

-- Moderation history, and reports that can be raised against more than a post.

/* --------------------------------------------------------- reports triage */

-- The reports table already carried post and comment. A reports centre needs to
-- cover the other things a person can complain about.
alter table public.reports drop constraint if exists reports_entity_type_check;
alter table public.reports add constraint reports_entity_type_check
  check (entity_type in ('post', 'comment', 'user', 'tool', 'model', 'developer'));

-- 'investigating' is the state a moderator picks something up into. Without it
-- a queue only has "nobody has looked" and "it is over".
alter table public.reports drop constraint if exists reports_status_check;
alter table public.reports add constraint reports_status_check
  check (status in ('open', 'investigating', 'upheld', 'dismissed'));

alter table public.reports
  add column if not exists priority        text not null default 'normal',
  add column if not exists assigned_to     uuid references public.profiles(id),
  add column if not exists resolution_note text,
  add column if not exists source          text not null default 'user';

alter table public.reports drop constraint if exists reports_priority_check;
alter table public.reports add constraint reports_priority_check
  check (priority in ('low', 'normal', 'high', 'critical'));

alter table public.reports drop constraint if exists reports_source_check;
alter table public.reports add constraint reports_source_check
  check (source in ('user', 'automated', 'staff'));

alter table public.reports drop constraint if exists reports_resolution_note_check;
alter table public.reports add constraint reports_resolution_note_check
  check (resolution_note is null or char_length(resolution_note) <= 1000);

-- Security and abuse are their own reasons rather than everything landing in
-- 'other', because the reports centre filters on this column.
alter table public.reports drop constraint if exists reports_reason_check;
alter table public.reports add constraint reports_reason_check
  check (reason in ('spam', 'abuse', 'harassment', 'offtopic', 'illegal', 'security', 'other'));

create index if not exists reports_status_idx   on public.reports (status, created_at desc);
create index if not exists reports_entity_idx   on public.reports (entity_type, entity_id);
create index if not exists reports_assigned_idx on public.reports (assigned_to, status);

-- The new columns are admin controlled. Revoke before you grant, every time.
revoke update, insert (priority, assigned_to, resolution_note, source)
  on public.reports from anon, authenticated;
-- A reporter may see how their own report was triaged, and a moderator sees all
-- of them. Which rows either can read is still decided by reports_select_auth.
grant select (priority, assigned_to, resolution_note, source)
  on public.reports to authenticated;

-- tg_reports_count assumed two entity types and treated anything that was not a
-- post as a comment. With four more types that silent else branch would go
-- looking for a tool id in the comments table. The counters only exist for post
-- and comment, so everything else now returns early and explicitly.
create or replace function public.tg_reports_count()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  threshold     integer := public.report_hide_threshold();
  min_age_hours integer := public.report_min_account_age_hours();
  target_author uuid;
  is_qualified  boolean := false;
  author_exempt boolean := false;
begin
  -- Only posts and comments carry report counters and an auto hide threshold.
  -- A report against a user, tool, model or developer is recorded and queued for
  -- a human, and nothing is hidden automatically.
  if new.entity_type not in ('post', 'comment') then
    return new;
  end if;

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

  -- Staff are exempt from auto hide. The role list grew, so it is read from the
  -- capability table rather than restated here and forgotten next time.
  select exists (
    select 1 from public.profiles a
    join public.admin_capabilities c on c.role = a.role
    where a.id = target_author and c.capability = 'admin.access'
  ) into author_exempt;

  if author_exempt then
    is_qualified := false;
  end if;

  new.qualified := is_qualified;

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


/* ------------------------------------------------------- moderation actions */

-- What was done to a person or a piece of content, and why. Separate from the
-- audit log on purpose: the audit log is the tamper evident record of every
-- admin act, this is the case history a moderator reads before deciding what to
-- do next, and it is the thing a warning count is derived from.
create table if not exists public.moderation_actions (
  id           uuid primary key default gen_random_uuid(),
  target_user  uuid references public.profiles(id),
  entity_type  text not null check (entity_type in ('user', 'post', 'comment', 'tool', 'model', 'developer')),
  entity_id    uuid,
  action       text not null check (action in (
                 'warn', 'suspend', 'unsuspend', 'disable', 'restore',
                 'hide', 'unhide', 'remove', 'approve', 'reject',
                 'request_changes', 'verify', 'unverify', 'escalate', 'dismiss')),
  reason       text check (reason is null or char_length(reason) <= 1000),
  report_id    uuid references public.reports(id),
  actor_id     uuid references public.profiles(id),
  created_at   timestamptz not null default now()
);

create index if not exists moderation_actions_target_idx on public.moderation_actions (target_user, created_at desc);
create index if not exists moderation_actions_entity_idx on public.moderation_actions (entity_type, entity_id, created_at desc);
create index if not exists moderation_actions_created_idx on public.moderation_actions (created_at desc);

alter table public.moderation_actions enable row level security;
revoke all on public.moderation_actions from anon, authenticated;

-- Read through the admin RPCs only. A person cannot enumerate who has been
-- warned, and a moderator reads the history through a capability checked call.
create policy moderation_actions_select_staff on public.moderation_actions
  for select to authenticated
  using (public.has_admin_capability('content.moderate')
      or public.has_admin_capability('users.moderate'));

grant select on public.moderation_actions to authenticated;
