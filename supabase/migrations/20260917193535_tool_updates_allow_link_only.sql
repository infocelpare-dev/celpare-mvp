-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260917193535. History: never edit.

-- Founder clarification, 2026-09-17: a launch post is a video, an image, or a
-- LINK ON ITS OWN. Nothing else, and never an arbitrary file.
--
-- A link only post has no hosted media, so tool_media.url has to be allowed to
-- be absent, and the kind has to be able to say "this is a link" rather than
-- leaving the profile to guess from a null.
--
-- 'link' is deliberately only valid on an update. A tool's own profile media is
-- a cover, a screenshot or a video; a link belongs in tool_links, which is what
-- the edit form fills in. This kind exists for news, not for the listing.

alter table public.tool_media alter column url drop not null;

alter table public.tool_media drop constraint if exists tool_media_kind_ok;
alter table public.tool_media
  add constraint tool_media_kind_ok
  check (kind = any (array['cover', 'screenshot', 'video', 'link']));

alter table public.tool_media drop constraint if exists tool_media_url_ok;
alter table public.tool_media
  add constraint tool_media_url_ok
  check (url is null or (url ~ '^https://' and char_length(url) <= 2048));

-- What each kind must carry, so a row can never be a post with nothing in it.
alter table public.tool_media drop constraint if exists tool_media_update_shape;
alter table public.tool_media
  add constraint tool_media_update_shape
  check (
    case
      when not is_update then kind <> 'link' and url is not null
      when kind = 'link'  then url is null and link_url is not null and caption is not null
      else url is not null and caption is not null
    end
  );

create or replace function public.post_tool_update(
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

  if v_status = 'rejected' then
    raise exception 'wrong_state' using errcode = '42501';
  end if;

  -- A video, an image, or a link. Never a cover, which is the tool's identity
  -- rather than news about it, and never anything else.
  if p_kind not in ('screenshot', 'video', 'link') then
    raise exception 'invalid_kind' using errcode = '22023';
  end if;

  if p_caption is null or btrim(p_caption) = '' then
    raise exception 'caption_required' using errcode = '22023';
  end if;

  if p_kind = 'link' then
    if nullif(btrim(p_link_url), '') is null then
      raise exception 'link_required' using errcode = '22023';
    end if;
  elsif nullif(btrim(p_url), '') is null then
    raise exception 'media_required' using errcode = '22023';
  end if;

  select coalesce(min(sort_order), 0) - 1 into v_next
  from public.tool_media where tool_id = p_tool_id and is_update;

  insert into public.tool_media (tool_id, kind, url, caption, link_url, sort_order, is_update)
  values (
    p_tool_id,
    p_kind,
    case when p_kind = 'link' then null else nullif(btrim(p_url), '') end,
    btrim(p_caption),
    nullif(btrim(p_link_url), ''),
    v_next,
    true
  )
  returning id into v_id;

  return v_id;
end;
$$;
