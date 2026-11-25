-- D275 (founder, 2026-11-25): accepting a rename also moves the tool's address.
-- The slug follows the new name, and every address the tool had before
-- redirects permanently to the current one, so links already shared, search
-- engines and saved Ask answers still land on the tool. Extends D274.

-- ------------------------------------------------------------ old addresses

create table public.tool_slug_redirects (
  old_slug text primary key,
  tool_id uuid not null references public.tools(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index tool_slug_redirects_tool on public.tool_slug_redirects (tool_id);

-- D119: revoke before granting. An old address is as public as the page it
-- points to, and RLS on tools still decides whether that page can be seen.
revoke all on table public.tool_slug_redirects from public, anon, authenticated;
alter table public.tool_slug_redirects enable row level security;
create policy tsr_select on public.tool_slug_redirects
  for select to anon, authenticated
  using (true);
grant select (old_slug, tool_id) on public.tool_slug_redirects to anon, authenticated;

-- ------------------------------------------------------------ the admin decision

create or replace function public.admin_decide_tool_rename(p_request uuid, p_decision text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r public.tool_rename_requests;
  v_tool record;
  v_base text;
  v_slug text;
  v_n int := 1;
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

  select id, name, slug, developer_id, status into v_tool from public.tools where id = r.tool_id for update;
  v_slug := v_tool.slug;

  if p_decision = 'approve' then
    if v_tool.developer_id is distinct from r.developer_id then
      raise exception 'not_owner' using errcode = 'P0001';
    end if;
    if v_tool.status <> 'approved' then raise exception 'tool_not_live' using errcode = 'P0001'; end if;

    -- The address follows the name: lowercase letters, digits and hyphens, at
    -- most 60 characters. A name with no Latin letters or digits keeps the
    -- current address rather than getting an empty one.
    v_base := btrim(regexp_replace(lower(r.requested_name), '[^a-z0-9]+', '-', 'g'), '-');
    v_base := btrim(left(v_base, 56), '-');

    if char_length(v_base) >= 2 and v_base <> v_tool.slug then
      v_slug := v_base;
      -- Taken by another tool, or still redirecting for another tool: add a
      -- number. An old address of this same tool may be taken back.
      while exists (select 1 from public.tools where slug = v_slug and id <> r.tool_id)
         or exists (select 1 from public.tool_slug_redirects where old_slug = v_slug and tool_id <> r.tool_id) loop
        v_n := v_n + 1;
        v_slug := v_base || '-' || v_n;
      end loop;
    end if;

    if v_slug <> v_tool.slug then
      insert into public.tool_slug_redirects (old_slug, tool_id)
      values (v_tool.slug, r.tool_id)
      on conflict (old_slug) do update set tool_id = excluded.tool_id, created_at = now();
      -- The new address is the tool's own now, not a redirect.
      delete from public.tool_slug_redirects where old_slug = v_slug and tool_id = r.tool_id;
    end if;

    update public.tools set name = r.requested_name, slug = v_slug where id = r.tool_id;
    perform public.refresh_tool_terms();
  end if;

  update public.tool_rename_requests
     set status = case when p_decision = 'approve' then 'approved' else 'rejected' end,
         decision_reason = nullif(btrim(coalesce(p_reason, '')), ''),
         decided_by = (select auth.uid()),
         decided_at = now()
   where id = r.id;

  perform public.admin_audit('tool.rename_decided', 'tool', r.tool_id::text, v_tool.name, p_reason,
    jsonb_build_object('request', r.id, 'status', 'pending', 'name', r.current_name, 'slug', v_tool.slug),
    jsonb_build_object('request', r.id,
      'status', case when p_decision = 'approve' then 'approved' else 'rejected' end,
      'name', case when p_decision = 'approve' then r.requested_name else v_tool.name end,
      'slug', v_slug));
end;
$function$;

revoke all on function public.admin_decide_tool_rename(uuid, text, text) from public, anon;
grant execute on function public.admin_decide_tool_rename(uuid, text, text) to authenticated;
