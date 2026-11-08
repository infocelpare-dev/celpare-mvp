-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260915080859. History: never edit.

-- Every sensitive admin action. Each one checks a capability, refuses to act
-- above its own privilege, and writes an audit entry in the same transaction as
-- the change, so a successful action that left no record is not a state the
-- database can reach.

-- Where a staff member sits. Used to stop an admin acting on another admin, and
-- to stop anybody quietly acting on a super admin.
create or replace function public.admin_rank(p_role text)
returns integer
language sql
immutable
as $$
  select case p_role
    when 'super_admin' then 4
    when 'admin' then 3
    when 'moderator' then 2
    when 'dev_ops' then 2
    when 'ai_ops' then 2
    when 'support' then 1
    else 0 end;
$$;

-- Raises unless the caller outranks the target. Equal rank is refused: two
-- admins cannot suspend each other, which is what stops a compromised admin
-- account from locking the real ones out.
create or replace function public.admin_assert_outranks(p_target uuid)
returns void
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare v_me text; v_them text;
begin
  select role into v_me   from public.profiles where id = (select auth.uid());
  select role into v_them from public.profiles where id = p_target;
  if v_them is null then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;
  if p_target = (select auth.uid()) then
    raise exception 'cannot_act_on_self' using errcode = '42501';
  end if;
  if public.admin_rank(v_them) >= public.admin_rank(v_me) then
    raise exception 'target_outranks_you' using errcode = '42501';
  end if;
end;
$$;


/* ----------------------------------------------------------- user status */

create or replace function public.admin_set_user_status(
  p_user_id uuid,
  p_status  text,
  p_reason  text default null,
  p_until   timestamptz default null
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_before record;
begin
  perform public.admin_require('users.moderate');
  perform public.admin_assert_outranks(p_user_id);

  if p_status not in ('active', 'suspended', 'disabled', 'deleted') then
    raise exception 'invalid_status:%', p_status using errcode = '22023';
  end if;
  -- A suspension without a stated reason is not reviewable later.
  if p_status <> 'active' and nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  select account_status, status_reason, suspended_until, username
    into v_before from public.profiles where id = p_user_id;

  update public.profiles
     set account_status = p_status,
         status_reason = nullif(btrim(coalesce(p_reason, '')), ''),
         status_changed_at = now(),
         suspended_until = case when p_status = 'suspended' then p_until else null end
   where id = p_user_id;

  insert into public.moderation_actions (target_user, entity_type, entity_id, action, reason, actor_id)
  values (p_user_id, 'user', p_user_id,
          case p_status
            when 'suspended' then 'suspend'
            when 'disabled'  then 'disable'
            when 'active'    then case when v_before.account_status = 'suspended' then 'unsuspend' else 'restore' end
            else 'disable' end,
          p_reason, (select auth.uid()));

  perform public.admin_audit(
    'user.status_changed', 'user', p_user_id::text, v_before.username::text, p_reason,
    jsonb_build_object('account_status', v_before.account_status,
                       'status_reason', v_before.status_reason,
                       'suspended_until', v_before.suspended_until),
    jsonb_build_object('account_status', p_status,
                       'status_reason', p_reason,
                       'suspended_until', case when p_status = 'suspended' then p_until else null end));
end;
$$;


/* ------------------------------------------------------------- user role */

create or replace function public.admin_set_user_role(
  p_user_id uuid,
  p_role    text,
  p_reason  text default null
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_before text; v_name text; v_supers integer;
begin
  -- Super admin only. This is the one call that hands out power, so it is the
  -- one capability no other role holds.
  perform public.admin_require('users.role');

  if p_role not in ('user', 'support', 'moderator', 'dev_ops', 'ai_ops', 'admin', 'super_admin') then
    raise exception 'invalid_role:%', p_role using errcode = '22023';
  end if;
  -- Nobody changes their own role, in either direction. Self promotion is the
  -- attack; self demotion is how an account locks everyone out by accident.
  if p_user_id = (select auth.uid()) then
    raise exception 'cannot_change_own_role' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  select role, username into v_before, v_name from public.profiles where id = p_user_id;
  if v_before is null then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;

  -- Demoting the last super admin would leave the platform with nobody who can
  -- promote anyone, which is unrecoverable without direct database access.
  if v_before = 'super_admin' and p_role <> 'super_admin' then
    select count(*) into v_supers from public.profiles
     where role = 'super_admin' and account_status = 'active';
    if v_supers <= 1 then
      raise exception 'last_super_admin' using errcode = '42501';
    end if;
  end if;

  update public.profiles set role = p_role, updated_at = now() where id = p_user_id;

  perform public.admin_audit(
    'user.role_changed', 'user', p_user_id::text, v_name::text, p_reason,
    jsonb_build_object('role', v_before), jsonb_build_object('role', p_role));
end;
$$;


/* ------------------------------------------------------------- user plan */

create or replace function public.admin_set_user_plan(
  p_user_id uuid,
  p_plan    text,
  p_reason  text default null
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_before text; v_name text;
begin
  perform public.admin_require('users.plan');

  if p_plan not in ('free', 'pro', 'premium') then
    raise exception 'invalid_plan:%', p_plan using errcode = '22023';
  end if;
  -- Changing a plan is changing what somebody is entitled to and, once billing
  -- exists, what they are charged. It is never a silent edit.
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  select plan, username into v_before, v_name from public.profiles where id = p_user_id;
  if v_before is null then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;

  update public.profiles set plan = p_plan, updated_at = now() where id = p_user_id;

  perform public.admin_audit(
    'user.plan_changed', 'user', p_user_id::text, v_name::text, p_reason,
    jsonb_build_object('plan', v_before), jsonb_build_object('plan', p_plan));
end;
$$;


/* ---------------------------------------------------------- warn a user */

create or replace function public.admin_warn_user(p_user_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_name text;
begin
  perform public.admin_require('users.moderate');
  perform public.admin_assert_outranks(p_user_id);

  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  select username into v_name from public.profiles where id = p_user_id;

  insert into public.moderation_actions (target_user, entity_type, entity_id, action, reason, actor_id)
  values (p_user_id, 'user', p_user_id, 'warn', p_reason, (select auth.uid()));

  perform public.admin_audit('user.warned', 'user', p_user_id::text, v_name::text, p_reason,
    '{}'::jsonb, jsonb_build_object('action', 'warn'));
end;
$$;


/* ---------------------------------------------------- content moderation */

create or replace function public.admin_set_content_status(
  p_entity_type text,
  p_entity_id   uuid,
  p_status      text,
  p_reason      text default null
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_before text; v_author uuid; v_label text;
begin
  perform public.admin_require('content.moderate');

  if p_entity_type not in ('post', 'comment') then
    raise exception 'invalid_entity_type:%', p_entity_type using errcode = '22023';
  end if;
  if p_status not in ('visible', 'hidden', 'removed') then
    raise exception 'invalid_status:%', p_status using errcode = '22023';
  end if;

  if p_entity_type = 'post' then
    select status, author_id, left(body, 80) into v_before, v_author, v_label
      from public.posts where id = p_entity_id;
  else
    select status, author_id, left(body, 80) into v_before, v_author, v_label
      from public.comments where id = p_entity_id;
  end if;

  if v_before is null then
    raise exception 'content_not_found' using errcode = 'P0002';
  end if;

  -- The existing moderation routine does the work, including clearing the
  -- qualified counter on restore so the same reporters cannot immediately
  -- re-trip the threshold. This wrapper adds the record, not the behaviour.
  perform public.moderate_set_status(p_entity_type, p_entity_id, p_status);

  insert into public.moderation_actions (target_user, entity_type, entity_id, action, reason, actor_id)
  values (v_author, p_entity_type, p_entity_id,
          case p_status when 'visible' then 'unhide' when 'hidden' then 'hide' else 'remove' end,
          p_reason, (select auth.uid()));

  perform public.admin_audit('content.status_changed', p_entity_type, p_entity_id::text,
    v_label, p_reason,
    jsonb_build_object('status', v_before), jsonb_build_object('status', p_status));
end;
$$;


/* -------------------------------------------------------------- reports */

create or replace function public.admin_resolve_report(
  p_report_id  uuid,
  p_resolution text,
  p_note       text default null,
  -- What to do to the thing reported. Separate from the resolution on purpose:
  -- upholding a report does not always mean removing the content, and a
  -- moderator should be able to say so.
  p_content_action text default null
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare r public.reports; v_target uuid;
begin
  perform public.admin_require('content.moderate');

  if p_resolution not in ('open', 'investigating', 'upheld', 'dismissed') then
    raise exception 'invalid_resolution:%', p_resolution using errcode = '22023';
  end if;

  select * into r from public.reports where id = p_report_id;
  if not found then
    raise exception 'report_not_found' using errcode = 'P0002';
  end if;

  -- Resolving covers every open report against the same item, not just the one
  -- that was clicked. Five people reporting one post is one decision.
  if p_resolution in ('upheld', 'dismissed') then
    update public.reports
       set status = p_resolution, resolved_by = (select auth.uid()), resolved_at = now(),
           resolution_note = nullif(btrim(coalesce(p_note, '')), '')
     where entity_type = r.entity_type and entity_id = r.entity_id
       and status in ('open', 'investigating');
  else
    update public.reports
       set status = p_resolution,
           assigned_to = coalesce(assigned_to, (select auth.uid()))
     where id = p_report_id;
  end if;

  if p_content_action is not null and r.entity_type in ('post', 'comment') then
    perform public.admin_set_content_status(r.entity_type, r.entity_id, p_content_action, p_note);
  end if;

  if r.entity_type = 'user' then
    v_target := r.entity_id;
  elsif r.entity_type = 'post' then
    select author_id into v_target from public.posts where id = r.entity_id;
  elsif r.entity_type = 'comment' then
    select author_id into v_target from public.comments where id = r.entity_id;
  end if;

  insert into public.moderation_actions
    (target_user, entity_type, entity_id, action, reason, report_id, actor_id)
  values (v_target, r.entity_type, r.entity_id,
          case p_resolution when 'upheld' then 'remove'
                            when 'dismissed' then 'dismiss'
                            else 'escalate' end,
          p_note, r.id, (select auth.uid()));

  perform public.admin_audit('report.resolved', 'report', r.id::text,
    r.entity_type || ' / ' || r.reason, p_note,
    jsonb_build_object('status', r.status),
    jsonb_build_object('status', p_resolution, 'content_action', p_content_action));
end;
$$;


create or replace function public.admin_triage_report(
  p_report_id uuid,
  p_priority  text default null,
  p_assign    boolean default null
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare r public.reports;
begin
  perform public.admin_require('content.moderate');

  select * into r from public.reports where id = p_report_id;
  if not found then
    raise exception 'report_not_found' using errcode = 'P0002';
  end if;

  if p_priority is not null and p_priority not in ('low', 'normal', 'high', 'critical') then
    raise exception 'invalid_priority:%', p_priority using errcode = '22023';
  end if;

  update public.reports
     set priority = coalesce(p_priority, priority),
         assigned_to = case
           when p_assign is null then assigned_to
           when p_assign then (select auth.uid())
           else null end,
         status = case when status = 'open' and coalesce(p_assign, false)
                       then 'investigating' else status end
   where id = p_report_id;

  perform public.admin_audit('report.triaged', 'report', r.id::text,
    r.entity_type || ' / ' || r.reason, null,
    jsonb_build_object('priority', r.priority, 'assigned_to', r.assigned_to),
    jsonb_build_object('priority', coalesce(p_priority, r.priority), 'assigned', p_assign));
end;
$$;


/* ---------------------------------------------------- submission review */

create or replace function public.admin_review_submission(
  p_kind     text,
  p_id       uuid,
  p_decision text,
  p_reason   text default null
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_before text; v_label text; v_owner uuid; v_new text;
begin
  perform public.admin_require('submissions.review');

  if p_kind not in ('tool', 'model') then
    raise exception 'invalid_kind:%', p_kind using errcode = '22023';
  end if;
  if p_decision not in ('approve', 'reject', 'request_changes', 'suspend', 'restore') then
    raise exception 'invalid_decision:%', p_decision using errcode = '22023';
  end if;
  -- Anything that sends work back to a developer has to say why, because they
  -- are the ones who have to act on it.
  if p_decision in ('reject', 'request_changes', 'suspend')
     and nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  v_new := case p_decision
    when 'approve' then 'approved'
    when 'reject'  then 'rejected'
    when 'request_changes' then 'changes_required'
    -- Suspending a live listing puts it back in the queue rather than deleting
    -- it: the developer keeps their work and the public stops seeing it.
    when 'suspend' then 'pending'
    when 'restore' then 'approved'
  end;

  if p_kind = 'tool' then
    select status, name, developer_id into v_before, v_label, v_owner
      from public.tools where id = p_id;
    if v_before is null then raise exception 'tool_not_found' using errcode = 'P0002'; end if;

    update public.tools
       set status = v_new,
           -- published_at is stamped once, on the first approval, so it keeps
           -- meaning "when this went live" through later edits.
           published_at = case when v_new = 'approved' then coalesce(published_at, now()) else published_at end,
           updated_at = now()
     where id = p_id;
  else
    select status, name, developer_id into v_before, v_label, v_owner
      from public.models where id = p_id;
    if v_before is null then raise exception 'model_not_found' using errcode = 'P0002'; end if;

    update public.models set status = v_new, updated_at = now() where id = p_id;
  end if;

  insert into public.moderation_actions (target_user, entity_type, entity_id, action, reason, actor_id)
  values (v_owner, p_kind, p_id,
          case p_decision when 'approve' then 'approve' when 'reject' then 'reject'
                          when 'request_changes' then 'request_changes'
                          when 'suspend' then 'hide' else 'unhide' end,
          p_reason, (select auth.uid()));

  perform public.admin_audit(p_kind || '.' || p_decision, p_kind, p_id::text, v_label, p_reason,
    jsonb_build_object('status', v_before), jsonb_build_object('status', v_new));
end;
$$;


create or replace function public.admin_set_tool_verified(
  p_id uuid, p_verified boolean, p_reason text default null
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_before boolean; v_label text;
begin
  perform public.admin_require('submissions.review');

  select verified, name into v_before, v_label from public.tools where id = p_id;
  if v_label is null then raise exception 'tool_not_found' using errcode = 'P0002'; end if;

  update public.tools set verified = p_verified, updated_at = now() where id = p_id;

  perform public.admin_audit('tool.verified_changed', 'tool', p_id::text, v_label, p_reason,
    jsonb_build_object('verified', v_before), jsonb_build_object('verified', p_verified));
end;
$$;


create or replace function public.admin_set_developer_verified(
  p_id uuid, p_verified boolean, p_reason text default null
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_before boolean; v_handle text;
begin
  perform public.admin_require('developers.manage');

  select verified, handle::text into v_before, v_handle
    from public.developer_profiles where id = p_id;
  if v_handle is null then raise exception 'developer_not_found' using errcode = 'P0002'; end if;

  update public.developer_profiles
     set verified = p_verified, updated_at = now() where id = p_id;

  insert into public.moderation_actions (target_user, entity_type, entity_id, action, reason, actor_id)
  values (p_id, 'developer', p_id, case when p_verified then 'verify' else 'unverify' end,
          p_reason, (select auth.uid()));

  perform public.admin_audit('developer.verified_changed', 'developer', p_id::text, v_handle, p_reason,
    jsonb_build_object('verified', v_before), jsonb_build_object('verified', p_verified));
end;
$$;


/* ------------------------------------------------------------- settings */

create or replace function public.admin_set_setting(
  p_scope  text,
  p_key    text,
  p_value  jsonb,
  p_reason text default null
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_before jsonb;
begin
  perform public.admin_require('settings.manage');

  if p_scope not in ('platform', 'community') then
    raise exception 'invalid_scope:%', p_scope using errcode = '22023';
  end if;

  if p_scope = 'platform' then
    select value into v_before from public.platform_settings where key = p_key;
    if v_before is null then
      -- Keys are created by migration, not by whoever types one into a form.
      -- An unknown key is a typo, and a typo that silently creates a setting is
      -- a setting nothing reads.
      raise exception 'unknown_setting:%', p_key using errcode = 'P0002';
    end if;
    update public.platform_settings
       set value = p_value, updated_by = (select auth.uid()), updated_at = now()
     where key = p_key;
  else
    select value into v_before from public.community_settings where key = p_key;
    if v_before is null then
      raise exception 'unknown_setting:%', p_key using errcode = 'P0002';
    end if;
    update public.community_settings
       set value = p_value, updated_at = now() where key = p_key;
  end if;

  perform public.admin_audit('settings.changed', 'setting', p_scope || '.' || p_key, p_key, p_reason,
    jsonb_build_object('value', v_before), jsonb_build_object('value', p_value));
end;
$$;


revoke execute on function public.admin_assert_outranks(uuid) from public;
revoke execute on function public.admin_set_user_status(uuid, text, text, timestamptz) from public;
revoke execute on function public.admin_set_user_role(uuid, text, text) from public;
revoke execute on function public.admin_set_user_plan(uuid, text, text) from public;
revoke execute on function public.admin_warn_user(uuid, text) from public;
revoke execute on function public.admin_set_content_status(text, uuid, text, text) from public;
revoke execute on function public.admin_resolve_report(uuid, text, text, text) from public;
revoke execute on function public.admin_triage_report(uuid, text, boolean) from public;
revoke execute on function public.admin_review_submission(text, uuid, text, text) from public;
revoke execute on function public.admin_set_tool_verified(uuid, boolean, text) from public;
revoke execute on function public.admin_set_developer_verified(uuid, boolean, text) from public;
revoke execute on function public.admin_set_setting(text, text, jsonb, text) from public;

grant execute on function public.admin_set_user_status(uuid, text, text, timestamptz) to authenticated;
grant execute on function public.admin_set_user_role(uuid, text, text) to authenticated;
grant execute on function public.admin_set_user_plan(uuid, text, text) to authenticated;
grant execute on function public.admin_warn_user(uuid, text) to authenticated;
grant execute on function public.admin_set_content_status(text, uuid, text, text) to authenticated;
grant execute on function public.admin_resolve_report(uuid, text, text, text) to authenticated;
grant execute on function public.admin_triage_report(uuid, text, boolean) to authenticated;
grant execute on function public.admin_review_submission(text, uuid, text, text) to authenticated;
grant execute on function public.admin_set_tool_verified(uuid, boolean, text) to authenticated;
grant execute on function public.admin_set_developer_verified(uuid, boolean, text) to authenticated;
grant execute on function public.admin_set_setting(text, text, jsonb, text) to authenticated;
