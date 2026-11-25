-- D274 (founder, 2026-11-25): the developer who owns a live tool edits its page
-- and the edit goes live at once, with no review. The NAME is the exception: it
-- is locked once the tool is live, and a new name is a rename request an admin
-- approves. The tool stays live under its old name meanwhile, and keeps its
-- slug, ratings and history. Replaces the 2026-09-17 rule that every edit of a
-- live tool took it off the catalogue and back to the review queue.
--
-- One case still goes back to review: a website on a different domain. The
-- owner email and the domain check vouch for one domain; pointing a live listing
-- at another site is a different product until somebody has looked.

-- ------------------------------------------------------------ rename requests

create table public.tool_rename_requests (
  id uuid primary key default gen_random_uuid(),
  tool_id uuid not null references public.tools(id) on delete cascade,
  developer_id uuid not null references public.profiles(id) on delete cascade,
  current_name text not null,
  requested_name text not null check (char_length(btrim(requested_name)) between 1 and 120),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  message text check (char_length(message) <= 1000),
  decision_reason text check (char_length(decision_reason) <= 1000),
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index tool_rename_requests_one_pending
  on public.tool_rename_requests (tool_id) where status = 'pending';
create index tool_rename_requests_queue
  on public.tool_rename_requests (status, created_at);
create index tool_rename_requests_developer
  on public.tool_rename_requests (developer_id);

-- D119: revoke before granting. Clients read their own rows (and reviewers all
-- of them); every write goes through the two functions below.
revoke all on table public.tool_rename_requests from public, anon, authenticated;
alter table public.tool_rename_requests enable row level security;
create policy trr_select on public.tool_rename_requests
  for select to authenticated
  using (developer_id = (select auth.uid()) or public.has_admin_capability('submissions.review'));
grant select (id, tool_id, developer_id, current_name, requested_name, status, message,
              decision_reason, decided_at, created_at)
  on public.tool_rename_requests to authenticated;

-- ------------------------------------------------------------ editing a tool

create or replace function public.update_tool(
  p_id uuid, p_name text, p_tagline text, p_description text, p_website_url text,
  p_docs_url text, p_logo_url text, p_pricing text, p_pricing_model text, p_tags text[],
  p_owner_email text, p_categories uuid[], p_links jsonb, p_media jsonb)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_old    public.tools%rowtype;
  v_status text;
  v_clear  boolean;
  v_moved  boolean;
begin
  if not public.is_active_developer() then
    raise exception 'not_authorised' using errcode = '42501';
  end if;

  select * into v_old from public.tools where id = p_id;
  if not found then
    raise exception 'tool_not_found' using errcode = '42501';
  end if;

  if v_old.developer_id is distinct from (select auth.uid()) then
    raise exception 'not_authorised' using errcode = '42501';
  end if;

  if v_old.status not in ('draft', 'changes_required', 'approved') then
    raise exception 'wrong_state' using errcode = '42501';
  end if;

  -- D274: a live tool's name changes only through request_tool_rename.
  if v_old.status = 'approved' and btrim(coalesce(p_name, '')) is distinct from v_old.name then
    raise exception 'name_locked' using errcode = 'P0001';
  end if;

  v_moved := public.normalize_domain(p_website_url) is distinct from v_old.canonical_domain;

  -- D274: a live edit stays live, unless the website moved to another domain.
  v_status := case when v_old.status = 'approved' and v_moved then 'pending' else v_old.status end;

  v_clear := v_moved
          or lower(nullif(btrim(p_owner_email), '')) is distinct from v_old.owner_email;

  update public.tools set
    name          = case when v_old.status = 'approved' then v_old.name else p_name end,
    tagline       = p_tagline,
    description   = p_description,
    website_url   = p_website_url,
    docs_url      = p_docs_url,
    logo_url      = p_logo_url,
    pricing       = p_pricing,
    pricing_model = p_pricing_model,
    tags          = coalesce(p_tags, '{}'),
    owner_email   = p_owner_email,
    status        = v_status,
    published_at  = case when v_status = 'pending' then null else v_old.published_at end,
    domain_verified_at   = case when v_clear then null else v_old.domain_verified_at end,
    domain_verified_by   = case when v_clear then null else v_old.domain_verified_by end,
    domain_verified_note = case when v_clear then null else v_old.domain_verified_note end
  where id = p_id;

  delete from public.tool_categories where tool_id = p_id;
  delete from public.tool_links      where tool_id = p_id;

  -- The profile's own media only. A feature update is news about the tool, not
  -- part of its profile, and the edit form does not carry them.
  delete from public.tool_media where tool_id = p_id and not is_update;

  insert into public.tool_categories (tool_id, category_id)
  select p_id, c from unnest(coalesce(p_categories, '{}'::uuid[])) as c;

  insert into public.tool_links (tool_id, kind, url)
  select p_id, e->>'kind', e->>'url'
  from jsonb_array_elements(coalesce(p_links, '[]'::jsonb)) as e;

  insert into public.tool_media (tool_id, kind, url, caption, sort_order)
  select p_id, e->>'kind', e->>'url',
         nullif(e->>'caption', ''),
         coalesce((e->>'sort_order')::smallint, 0)
  from jsonb_array_elements(coalesce(p_media, '[]'::jsonb)) as e;

  -- Live search terms follow a live edit at once, as a published tool's would.
  if v_status = 'approved' then
    perform public.refresh_tool_terms();
  end if;

  return v_status;
end;
$function$;

-- ------------------------------------------------------------ asking for a new name

create or replace function public.request_tool_rename(p_tool uuid, p_name text, p_message text default null)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_owner uuid; v_status text; v_name text; v_new text; v_id uuid;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if not public.is_active_developer() then raise exception 'not_developer' using errcode = '42501'; end if;

  select developer_id, status, name into v_owner, v_status, v_name
    from public.tools where id = p_tool;
  if v_owner is distinct from v_uid then raise exception 'not_owner' using errcode = '42501'; end if;
  if v_status <> 'approved' then raise exception 'tool_not_live' using errcode = 'P0001'; end if;

  v_new := btrim(coalesce(p_name, ''));
  if char_length(v_new) not between 1 and 120 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  if v_new = v_name then raise exception 'same_name' using errcode = 'P0001'; end if;

  begin
    insert into public.tool_rename_requests (tool_id, developer_id, current_name, requested_name, message)
    values (p_tool, v_uid, v_name, v_new, nullif(btrim(coalesce(p_message, '')), ''))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'already_requested' using errcode = 'P0001';
  end;
  return v_id;
end;
$function$;

-- ------------------------------------------------------------ the admin decision

create or replace function public.admin_decide_tool_rename(p_request uuid, p_decision text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare r public.tool_rename_requests; v_tool record;
begin
  perform public.admin_require('submissions.review');

  if p_decision not in ('approve', 'reject') then
    raise exception 'invalid_decision:%', p_decision using errcode = '22023';
  end if;
  if p_decision = 'reject' and nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  select * into r from public.tool_rename_requests where id = p_request for update;
  if r.id is null then raise exception 'request_not_found' using errcode = 'P0002'; end if;
  if r.status <> 'pending' then raise exception 'request_not_pending' using errcode = 'P0001'; end if;

  select id, name, developer_id, status into v_tool from public.tools where id = r.tool_id;

  if p_decision = 'approve' then
    if v_tool.developer_id is distinct from r.developer_id then
      raise exception 'not_owner' using errcode = 'P0001';
    end if;
    if v_tool.status <> 'approved' then raise exception 'tool_not_live' using errcode = 'P0001'; end if;

    update public.tools set name = r.requested_name where id = r.tool_id;
    perform public.refresh_tool_terms();
  end if;

  update public.tool_rename_requests
     set status = case when p_decision = 'approve' then 'approved' else 'rejected' end,
         decision_reason = nullif(btrim(coalesce(p_reason, '')), ''),
         decided_by = (select auth.uid()),
         decided_at = now()
   where id = r.id;

  perform public.admin_audit('tool.rename_decided', 'tool', r.tool_id::text, v_tool.name, p_reason,
    jsonb_build_object('request', r.id, 'status', 'pending', 'name', r.current_name),
    jsonb_build_object('request', r.id,
      'status', case when p_decision = 'approve' then 'approved' else 'rejected' end,
      'name', case when p_decision = 'approve' then r.requested_name else v_tool.name end));
end;
$function$;

-- D250: caller checking RPCs keep EXECUTE for signed in clients only.
revoke all on function public.update_tool(uuid, text, text, text, text, text, text, text, text, text[], text, uuid[], jsonb, jsonb) from public, anon;
grant execute on function public.update_tool(uuid, text, text, text, text, text, text, text, text, text[], text, uuid[], jsonb, jsonb) to authenticated;
revoke all on function public.request_tool_rename(uuid, text, text) from public, anon;
grant execute on function public.request_tool_rename(uuid, text, text) to authenticated;
revoke all on function public.admin_decide_tool_rename(uuid, text, text) from public, anon;
grant execute on function public.admin_decide_tool_rename(uuid, text, text) to authenticated;
