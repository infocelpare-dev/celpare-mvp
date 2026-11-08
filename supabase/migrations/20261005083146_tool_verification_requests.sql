-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20261005083146. History: never edit.

-- D201, superseding D200's automatic half: an Elite developer REQUESTS a verified
-- tool and an admin accepts it. The plan is checked when the request is made and
-- again when it is accepted. Nothing is verified automatically any more.

drop trigger if exists tools_verify_plan on public.tools;
drop trigger if exists tools_verify_plan_owner on public.tools;
drop function if exists public.tg_tool_plan_verify();

-- Undo what the automatic rule gave (the founder's account and its test tool).
update public.tools set verified = false, verified_via = null where verified_via = 'plan';
update public.developer_profiles set verified = false, verified_via = null, updated_at = now()
 where verified_via = 'plan';

alter table public.tools drop constraint if exists tools_verified_via_check;
alter table public.tools add constraint tools_verified_via_check
  check (verified_via in ('admin', 'request'));
alter table public.developer_profiles drop constraint if exists developer_profiles_verified_via_check;
alter table public.developer_profiles add constraint developer_profiles_verified_via_check
  check (verified_via in ('admin'));

create table public.tool_verification_requests (
  id uuid primary key default gen_random_uuid(),
  tool_id uuid not null references public.tools(id) on delete cascade,
  developer_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  message text check (char_length(message) <= 1000),
  decision_reason text check (char_length(decision_reason) <= 1000),
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index tool_verification_requests_one_pending
  on public.tool_verification_requests (tool_id) where status = 'pending';
create index tool_verification_requests_queue
  on public.tool_verification_requests (status, created_at);
create index tool_verification_requests_developer
  on public.tool_verification_requests (developer_id);

alter table public.tool_verification_requests enable row level security;
create policy tvr_select on public.tool_verification_requests
  for select to authenticated
  using (developer_id = (select auth.uid()) or public.has_admin_capability('submissions.review'));

-- Read only for clients, and not who decided: that is in the audit log.
grant select (id, tool_id, developer_id, status, message, decision_reason, decided_at, created_at)
  on public.tool_verification_requests to authenticated;

-- Leaving Elite takes the request verified badges with it and closes open requests.
create or replace function public.developer_plan_sync(p_dev uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_plan text;
begin
  select plan into v_plan from public.developer_profiles where id = p_dev;
  if v_plan is null or v_plan = 'elite' then return; end if;

  update public.tools
     set verified = false, verified_via = null
   where developer_id = p_dev and verified_via = 'request';
  update public.tool_verification_requests
     set status = 'cancelled', decision_reason = 'The developer left the Elite plan.', decided_at = now()
   where developer_id = p_dev and status = 'pending';
end;
$$;
revoke all on function public.developer_plan_sync(uuid) from public, anon, authenticated;

create or replace function public.request_tool_verification(p_tool uuid, p_message text default null)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := (select auth.uid());
  v_owner uuid; v_status text; v_verified boolean; v_plan text; v_id uuid;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if not public.is_active_developer() then raise exception 'not_developer' using errcode = '42501'; end if;

  select developer_id, status, verified into v_owner, v_status, v_verified
    from public.tools where id = p_tool;
  if v_owner is distinct from v_uid then raise exception 'not_owner' using errcode = '42501'; end if;
  if v_verified then raise exception 'already_verified' using errcode = 'P0001'; end if;
  if v_status <> 'approved' then raise exception 'tool_not_live' using errcode = 'P0001'; end if;

  select plan into v_plan from public.developer_profiles where id = v_uid;
  if v_plan is distinct from 'elite' then raise exception 'elite_required' using errcode = 'P0001'; end if;

  begin
    insert into public.tool_verification_requests (tool_id, developer_id, message)
    values (p_tool, v_uid, nullif(btrim(coalesce(p_message, '')), ''))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'already_requested' using errcode = 'P0001';
  end;
  return v_id;
end;
$$;
revoke all on function public.request_tool_verification(uuid, text) from public, anon;
grant execute on function public.request_tool_verification(uuid, text) to authenticated;

create or replace function public.admin_decide_tool_verification(p_request uuid, p_decision text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare r public.tool_verification_requests; v_plan text; v_tool record;
begin
  perform public.admin_require('submissions.review');

  if p_decision not in ('approve', 'reject') then
    raise exception 'invalid_decision:%', p_decision using errcode = '22023';
  end if;
  if p_decision = 'reject' and nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  select * into r from public.tool_verification_requests where id = p_request for update;
  if r.id is null then raise exception 'request_not_found' using errcode = 'P0002'; end if;
  if r.status <> 'pending' then raise exception 'request_not_pending' using errcode = 'P0001'; end if;

  select id, name, developer_id, status into v_tool from public.tools where id = r.tool_id;

  if p_decision = 'approve' then
    -- The plan is checked again here, not only when the request was made.
    select plan into v_plan from public.developer_profiles where id = r.developer_id;
    if v_plan is distinct from 'elite' then raise exception 'elite_required' using errcode = 'P0001'; end if;
    if v_tool.developer_id is distinct from r.developer_id then
      raise exception 'not_owner' using errcode = 'P0001';
    end if;
    if v_tool.status <> 'approved' then raise exception 'tool_not_live' using errcode = 'P0001'; end if;

    update public.tools set verified = true, verified_via = 'request', updated_at = now()
     where id = r.tool_id;
  end if;

  update public.tool_verification_requests
     set status = case when p_decision = 'approve' then 'approved' else 'rejected' end,
         decision_reason = nullif(btrim(coalesce(p_reason, '')), ''),
         decided_by = (select auth.uid()),
         decided_at = now()
   where id = r.id;

  perform public.admin_audit('tool.verification_request_decided', 'tool', r.tool_id::text, v_tool.name, p_reason,
    jsonb_build_object('request', r.id, 'status', 'pending'),
    jsonb_build_object('request', r.id, 'status', case when p_decision = 'approve' then 'approved' else 'rejected' end));
end;
$$;
revoke all on function public.admin_decide_tool_verification(uuid, text, text) from public, anon;
grant execute on function public.admin_decide_tool_verification(uuid, text, text) to authenticated;
