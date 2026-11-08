-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260915132557. History: never edit.

-- Phase 4Q.3, the last inert setting.
--
-- platform_settings carried 'moderation.auto_hide' and tg_reports_count never
-- read it, so the switch an administrator could toggle in /admin/settings did
-- nothing at all. The thresholds in community_settings were wired; this one was
-- not.

create or replace function public.auto_hide_enabled()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- Defaults ON when the key is missing. Auto hide is a safety mechanism, and
  -- a deleted row should not quietly disable it.
  select coalesce(
    (select value = 'true'::jsonb
       from public.platform_settings
      where key = 'moderation.auto_hide'),
    true);
$$;

revoke all on function public.auto_hide_enabled() from public, anon, authenticated;
-- No client grant. Only the trigger, which is SECURITY DEFINER, calls it.

create or replace function public.tg_reports_count()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  threshold     integer := public.report_hide_threshold();
  min_age_hours integer := public.report_min_account_age_hours();
  auto_hide     boolean := public.auto_hide_enabled();
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

  -- Counting and hiding are separated deliberately. With auto hide off the
  -- reports still accumulate and still show in the moderation queue, so turning
  -- it off means "a human decides", not "stop listening". Turning it back on
  -- then has the counts it needs already.
  if new.entity_type = 'post' then
    update public.posts
       set report_count = report_count + 1,
           qualified_report_count =
             qualified_report_count + (case when is_qualified then 1 else 0 end),
           status = case
                      when auto_hide
                       and is_qualified
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
                      when auto_hide
                       and is_qualified
                       and qualified_report_count + 1 >= threshold
                       and status = 'visible'
                      then 'hidden' else status
                    end
     where id = new.entity_id;
  end if;

  return new;
end;
$function$;
