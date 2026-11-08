-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20261005124522. History: never edit.

-- Sponsored tools (D204). A developer asks to sponsor one of their live tools
-- for $149.99 a month; an admin activates it until payments exist (Phase 7),
-- the same arrangement as the developer plan (D200). An active sponsorship
-- adds a labelled Sponsored slot in Search and Ask, at most three, only when
-- the tool matches. It never changes organic ranking.

create table public.tool_sponsorships (
  id uuid primary key default gen_random_uuid(),
  tool_id uuid not null references public.tools(id) on delete cascade,
  developer_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'active', 'rejected', 'cancelled', 'ended')),
  price_cents integer not null default 14999 check (price_cents >= 0),
  message text check (char_length(message) <= 1000),
  decision_reason text check (char_length(decision_reason) <= 1000),
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  starts_at timestamptz,
  ends_at timestamptz,
  source text not null default 'request' check (source in ('request', 'admin')),
  created_at timestamptz not null default now(),
  check (status <> 'active' or (starts_at is not null and ends_at is not null and ends_at > starts_at))
);

-- One open sponsorship per tool: a request waiting, or one running.
create unique index tool_sponsorships_one_open on public.tool_sponsorships (tool_id)
  where status in ('pending', 'active');
create index tool_sponsorships_queue on public.tool_sponsorships (status, created_at);
create index tool_sponsorships_developer on public.tool_sponsorships (developer_id);

alter table public.tool_sponsorships enable row level security;

create policy ts_select on public.tool_sponsorships for select to authenticated
  using (developer_id = (select auth.uid()) or public.has_admin_capability('users.plan'));

revoke all on public.tool_sponsorships from public, anon, authenticated;
grant select (id, tool_id, developer_id, status, price_cents, message, decision_reason,
              decided_at, starts_at, ends_at, source, created_at)
  on public.tool_sponsorships to authenticated;

-- The developer asks. Owner, active developer, live tool, nothing open.
create or replace function public.request_tool_sponsorship(p_tool uuid, p_message text default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid := (select auth.uid()); v_owner uuid; v_status text; v_id uuid;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if not public.is_active_developer() then raise exception 'not_developer' using errcode = '42501'; end if;
  select developer_id, status into v_owner, v_status from public.tools where id = p_tool;
  if v_owner is distinct from v_uid then raise exception 'not_owner' using errcode = '42501'; end if;
  if v_status <> 'approved' then raise exception 'tool_not_live' using errcode = 'P0001'; end if;
  -- A run that has passed its end date no longer counts as open.
  update public.tool_sponsorships set status = 'ended'
   where tool_id = p_tool and status = 'active' and ends_at <= now();
  begin
    insert into public.tool_sponsorships (tool_id, developer_id, message)
    values (p_tool, v_uid, nullif(btrim(coalesce(p_message, '')), ''))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'already_open' using errcode = 'P0001';
  end;
  return v_id;
end $$;

-- The admin decides. Approve starts it now for p_months months (one by default).
create or replace function public.admin_decide_tool_sponsorship(
  p_request uuid, p_decision text, p_reason text default null, p_months integer default 1)
returns void language plpgsql security definer set search_path to 'public' as $$
declare r public.tool_sponsorships; v_tool record; v_new text;
begin
  perform public.admin_require('users.plan');
  if p_decision not in ('approve', 'reject') then
    raise exception 'invalid_decision:%', p_decision using errcode = '22023';
  end if;
  if p_decision = 'reject' and nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  if p_months is null or p_months < 1 or p_months > 12 then
    raise exception 'invalid_months' using errcode = '22023';
  end if;

  select * into r from public.tool_sponsorships where id = p_request for update;
  if r.id is null then raise exception 'request_not_found' using errcode = 'P0002'; end if;
  if r.status <> 'pending' then raise exception 'request_not_pending' using errcode = 'P0001'; end if;

  select id, name, developer_id, status into v_tool from public.tools where id = r.tool_id;

  if p_decision = 'approve' then
    if v_tool.developer_id is distinct from r.developer_id then
      raise exception 'not_owner' using errcode = 'P0001';
    end if;
    if v_tool.status <> 'approved' then raise exception 'tool_not_live' using errcode = 'P0001'; end if;
    update public.tool_sponsorships
       set status = 'active', starts_at = now(), ends_at = now() + make_interval(months => p_months),
           decision_reason = nullif(btrim(coalesce(p_reason, '')), ''),
           decided_by = (select auth.uid()), decided_at = now()
     where id = r.id;
    v_new := 'active';
  else
    update public.tool_sponsorships
       set status = 'rejected', decision_reason = btrim(p_reason),
           decided_by = (select auth.uid()), decided_at = now()
     where id = r.id;
    v_new := 'rejected';
  end if;

  perform public.admin_audit('tool.sponsorship_decided', 'tool', r.tool_id::text, v_tool.name, p_reason,
    jsonb_build_object('sponsorship', r.id, 'status', 'pending'),
    jsonb_build_object('sponsorship', r.id, 'status', v_new, 'months', case when v_new = 'active' then p_months end));
end $$;

-- The admin extends a running sponsorship, or ends it now.
create or replace function public.admin_change_tool_sponsorship(
  p_id uuid, p_action text, p_reason text default null, p_months integer default 1)
returns void language plpgsql security definer set search_path to 'public' as $$
declare r public.tool_sponsorships; v_name text;
begin
  perform public.admin_require('users.plan');
  if p_action not in ('extend', 'end') then
    raise exception 'invalid_action:%', p_action using errcode = '22023';
  end if;
  if p_months is null or p_months < 1 or p_months > 12 then
    raise exception 'invalid_months' using errcode = '22023';
  end if;
  select * into r from public.tool_sponsorships where id = p_id for update;
  if r.id is null then raise exception 'sponsorship_not_found' using errcode = 'P0002'; end if;
  if r.status <> 'active' then raise exception 'sponsorship_not_active' using errcode = 'P0001'; end if;
  select name into v_name from public.tools where id = r.tool_id;

  if p_action = 'extend' then
    update public.tool_sponsorships
       set ends_at = greatest(ends_at, now()) + make_interval(months => p_months)
     where id = r.id;
  else
    if nullif(btrim(coalesce(p_reason, '')), '') is null then
      raise exception 'reason_required' using errcode = '22023';
    end if;
    update public.tool_sponsorships
       set status = 'ended', ends_at = now(), decision_reason = btrim(p_reason),
           decided_by = (select auth.uid()), decided_at = now()
     where id = r.id;
  end if;

  perform public.admin_audit('tool.sponsorship_changed', 'tool', r.tool_id::text, v_name, p_reason,
    jsonb_build_object('sponsorship', r.id, 'ends_at', r.ends_at),
    jsonb_build_object('sponsorship', r.id, 'action', p_action, 'months', p_months));
end $$;

-- What Search and Ask read: tool ids sponsored right now, live tools only.
-- Public on purpose: every one of these is labelled Sponsored where it shows.
create or replace function public.sponsored_tool_ids()
returns setof uuid language sql stable security definer set search_path to 'public' as $$
  select s.tool_id
    from public.tool_sponsorships s
    join public.tools t on t.id = s.tool_id
   where s.status = 'active' and s.starts_at <= now() and s.ends_at > now()
     and t.status = 'approved';
$$;

revoke all on function public.request_tool_sponsorship(uuid, text) from public, anon;
revoke all on function public.admin_decide_tool_sponsorship(uuid, text, text, integer) from public, anon;
revoke all on function public.admin_change_tool_sponsorship(uuid, text, text, integer) from public, anon;
revoke all on function public.sponsored_tool_ids() from public;
grant execute on function public.request_tool_sponsorship(uuid, text) to authenticated;
grant execute on function public.admin_decide_tool_sponsorship(uuid, text, text, integer) to authenticated;
grant execute on function public.admin_change_tool_sponsorship(uuid, text, text, integer) to authenticated;
grant execute on function public.sponsored_tool_ids() to anon, authenticated;
