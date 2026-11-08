-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260917193242. History: never edit.

-- "Launch a new feature": the developer who submitted a tool posts a video or
-- an image about something they have just shipped, and it appears in the
-- tool's media. Founder instruction 2026-09-17.
--
-- THREE THINGS THIS MUST NOT DO, all of them stated in that instruction:
--   * it must not need approval, so it never touches tools.status
--   * it is not part of editing the tool, so the edit form never shows it
--   * only the developer who submitted the tool may post one
--
-- WHY A FLAG RATHER THAN A NEW KIND. update_tool replaces a tool's media
-- wholesale: the edit form posts the whole set and a row missing from it is a
-- row the owner removed. Feature posts are not in that form, so without a way
-- to tell them apart the first edit after a launch post would delete every
-- launch post. is_update is what update_tool now excludes from its delete.
--
-- kind stays 'screenshot' or 'video' so the profile can render it without
-- knowing anything new, and 'cover' can never be an update: a cover is part of
-- the tool's identity, not news about it.

alter table public.tool_media
  add column if not exists is_update boolean not null default false,
  add column if not exists link_url text;

alter table public.tool_media
  drop constraint if exists tool_media_link_url_ok;
alter table public.tool_media
  add constraint tool_media_link_url_ok
  check (link_url is null or (link_url ~ '^https://' and char_length(link_url) <= 2048));

alter table public.tool_media
  drop constraint if exists tool_media_update_shape;
alter table public.tool_media
  add constraint tool_media_update_shape
  check (not is_update or (kind <> 'cover' and caption is not null));

-- Posting one. SECURITY DEFINER for the same reason update_tool is: the owner
-- of an APPROVED tool has no write path to tool_media at all, because
-- may_edit_tool() allows only draft and changes_required, and widening that
-- would also hand them silent edits to a live tool's links and categories,
-- which is exactly what the requeue rule exists to prevent.
--
-- So this is narrow on purpose. It inserts one row, it cannot change the tool,
-- and it takes no status, no is_update and no kind it has not checked.
create or replace function public.post_tool_update(
  p_tool_id  uuid,
  p_kind     text,
  p_url      text,
  p_caption  text,
  p_link_url text
) returns uuid
language plpgsql
security invoker
set search_path to 'public'
as $$
begin
  raise exception 'replaced_below';
end;
$$;

drop function if exists public.post_tool_update(uuid, text, text, text, text);

create function public.post_tool_update(
  p_tool_id  uuid,
  p_kind     text,
  p_url      text,
  p_caption  text,
  p_link_url text
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_status text;
  v_owner  uuid;
  v_id     uuid;
  v_next   smallint;
begin
  if not public.is_active_developer() then
    raise exception 'not_authorised' using errcode = '42501';
  end if;

  select status, developer_id into v_status, v_owner
  from public.tools where id = p_tool_id;

  if not found then
    raise exception 'tool_not_found' using errcode = '42501';
  end if;

  if v_owner is distinct from (select auth.uid()) then
    raise exception 'not_authorised' using errcode = '42501';
  end if;

  -- Rejected is closed, so there is nothing to announce about it. Every other
  -- state is fine: a draft's updates simply are not public yet.
  if v_status = 'rejected' then
    raise exception 'wrong_state' using errcode = '42501';
  end if;

  if p_kind not in ('screenshot', 'video') then
    raise exception 'invalid_kind' using errcode = '22023';
  end if;

  if p_caption is null or btrim(p_caption) = '' then
    raise exception 'caption_required' using errcode = '22023';
  end if;

  -- Newest first is what a feed means, and sort_order is what the profile
  -- already sorts on, so a new post takes the lowest number rather than the
  -- rendering having to learn a second rule.
  select coalesce(min(sort_order), 0) - 1 into v_next
  from public.tool_media where tool_id = p_tool_id and is_update;

  insert into public.tool_media (tool_id, kind, url, caption, link_url, sort_order, is_update)
  values (p_tool_id, p_kind, p_url, btrim(p_caption), nullif(btrim(p_link_url), ''), v_next, true)
  returning id into v_id;

  return v_id;
end;
$$;

-- Removing one you posted. Without this a bad post is permanent on a live
-- tool, for the same reason posting needed a function in the first place.
create or replace function public.delete_tool_update(p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_owner uuid;
begin
  select t.developer_id into v_owner
  from public.tool_media m join public.tools t on t.id = m.tool_id
  where m.id = p_id and m.is_update;

  if not found then
    raise exception 'not_found' using errcode = '42501';
  end if;

  if v_owner is distinct from (select auth.uid()) or not public.is_active_developer() then
    raise exception 'not_authorised' using errcode = '42501';
  end if;

  delete from public.tool_media where id = p_id and is_update;
end;
$$;

-- Rule 6: pg_default_acl hands EXECUTE on every new function to anon and
-- authenticated. Revoke first, then name who may call it.
revoke all on function public.post_tool_update(uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.post_tool_update(uuid, text, text, text, text)
  to authenticated;

revoke all on function public.delete_tool_update(uuid) from public, anon, authenticated;
grant execute on function public.delete_tool_update(uuid) to authenticated;
