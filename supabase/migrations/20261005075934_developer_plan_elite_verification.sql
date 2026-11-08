-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20261005075934. History: never edit.

-- D200: an Elite developer's tools, and the developer, are verified by the plan,
-- with no admin step. Admin verification stays and is kept apart by verified_via,
-- so a downgrade removes only what the plan granted.

alter table public.developer_profiles
  add column plan text not null default 'free'
    check (plan in ('free', 'pro', 'elite')),
  add column verified_via text
    check (verified_via in ('admin', 'plan'));

alter table public.tools
  add column verified_via text
    check (verified_via in ('admin', 'plan'));

-- Every verification that exists today was given by an admin.
update public.developer_profiles set verified_via = 'admin' where verified;
update public.tools set verified_via = 'admin' where verified;

-- Readable, never writable: the plan and the source are set by the server only.
grant select (plan, verified_via) on public.developer_profiles to authenticated;
grant select (verified_via) on public.tools to authenticated;

-- One place that makes the badges match the plan.
create or replace function public.developer_plan_sync(p_dev uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_plan text;
begin
  select plan into v_plan from public.developer_profiles where id = p_dev;
  if v_plan is null then return; end if;

  if v_plan = 'elite' then
    update public.developer_profiles
       set verified = true, verified_via = 'plan', updated_at = now()
     where id = p_dev and not verified;
    update public.tools
       set verified = true, verified_via = 'plan'
     where developer_id = p_dev and not verified;
  else
    update public.developer_profiles
       set verified = false, verified_via = null, updated_at = now()
     where id = p_dev and verified_via = 'plan';
    update public.tools
       set verified = false, verified_via = null
     where developer_id = p_dev and verified_via = 'plan';
  end if;
end;
$$;
revoke all on function public.developer_plan_sync(uuid) from public, anon, authenticated;

create or replace function public.tg_developer_plan_changed()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform public.developer_plan_sync(new.id);
  return null;
end;
$$;
revoke all on function public.tg_developer_plan_changed() from public, anon, authenticated;

create trigger developer_profiles_plan_sync
  after update of plan on public.developer_profiles
  for each row when (new.plan is distinct from old.plan)
  execute function public.tg_developer_plan_changed();

-- A tool that arrives under, or moves to, an Elite developer is verified on the
-- way in. Named to fire after tools_submission_guard, which zeroes verified on a
-- client insert.
create or replace function public.tg_tool_plan_verify()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_elite boolean;
begin
  select plan = 'elite' into v_elite
    from public.developer_profiles where id = new.developer_id;

  if coalesce(v_elite, false) then
    if not new.verified then
      new.verified := true;
      new.verified_via := 'plan';
    end if;
  elsif new.verified_via = 'plan' then
    new.verified := false;
    new.verified_via := null;
  end if;
  return new;
end;
$$;
revoke all on function public.tg_tool_plan_verify() from public, anon, authenticated;

create trigger tools_verify_plan
  before insert on public.tools
  for each row execute function public.tg_tool_plan_verify();

create trigger tools_verify_plan_owner
  before update of developer_id on public.tools
  for each row when (new.developer_id is distinct from old.developer_id)
  execute function public.tg_tool_plan_verify();

-- Admin verification records itself as admin, so a plan change never undoes it.
create or replace function public.admin_set_tool_verified(p_id uuid, p_verified boolean, p_reason text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_before boolean; v_label text;
begin
  perform public.admin_require('submissions.review');

  select verified, name into v_before, v_label from public.tools where id = p_id;
  if v_label is null then raise exception 'tool_not_found' using errcode = 'P0002'; end if;

  update public.tools
     set verified = p_verified,
         verified_via = case when p_verified then 'admin' end,
         updated_at = now()
   where id = p_id;

  perform public.admin_audit('tool.verified_changed', 'tool', p_id::text, v_label, p_reason,
    jsonb_build_object('verified', v_before), jsonb_build_object('verified', p_verified));
end;
$function$;

create or replace function public.admin_set_developer_verified(p_id uuid, p_verified boolean, p_reason text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_before boolean; v_handle text;
begin
  perform public.admin_require('developers.manage');

  select verified, handle::text into v_before, v_handle
    from public.developer_profiles where id = p_id;
  if v_handle is null then raise exception 'developer_not_found' using errcode = 'P0002'; end if;

  update public.developer_profiles
     set verified = p_verified,
         verified_via = case when p_verified then 'admin' end,
         updated_at = now()
   where id = p_id;

  insert into public.moderation_actions (target_user, entity_type, entity_id, action, reason, actor_id)
  values (p_id, 'developer', p_id, case when p_verified then 'verify' else 'unverify' end,
          p_reason, (select auth.uid()));

  perform public.admin_audit('developer.verified_changed', 'developer', p_id::text, v_handle, p_reason,
    jsonb_build_object('verified', v_before), jsonb_build_object('verified', p_verified));
end;
$function$;

-- Until payments exist (Phase 7) the developer plan is set here, by an admin, with a reason.
create or replace function public.admin_set_developer_plan(p_id uuid, p_plan text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_before text; v_handle text;
begin
  perform public.admin_require('developers.manage');

  if p_plan not in ('free', 'pro', 'elite') then
    raise exception 'invalid_plan:%', p_plan using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  select plan, handle::text into v_before, v_handle
    from public.developer_profiles where id = p_id;
  if v_handle is null then raise exception 'developer_not_found' using errcode = 'P0002'; end if;

  update public.developer_profiles set plan = p_plan, updated_at = now() where id = p_id;

  perform public.admin_audit('developer.plan_changed', 'developer', p_id::text, v_handle, p_reason,
    jsonb_build_object('plan', v_before), jsonb_build_object('plan', p_plan));
end;
$function$;
revoke all on function public.admin_set_developer_plan(uuid, text, text) from public, anon;
grant execute on function public.admin_set_developer_plan(uuid, text, text) to authenticated;
