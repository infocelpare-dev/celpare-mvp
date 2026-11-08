-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260917193313. History: never edit.

-- update_tool replaces a tool's media wholesale, because the edit form posts
-- the whole set and a row missing from it is one the owner removed.
--
-- Feature updates are NOT in that form, by founder instruction: launching a
-- feature is not editing the tool. So without this, the first edit after a
-- launch post would silently delete every launch post, and the developer would
-- have no way to know why their announcements vanished.
--
-- Only the delete changes. Everything else is as the previous migration left
-- it, restated here in full because create or replace takes the whole body.

create or replace function public.update_tool(
  p_id             uuid,
  p_name           text,
  p_tagline        text,
  p_description    text,
  p_website_url    text,
  p_docs_url       text,
  p_logo_url       text,
  p_pricing        text,
  p_pricing_model  text,
  p_tags           text[],
  p_owner_email    text,
  p_categories     uuid[],
  p_links          jsonb,
  p_media          jsonb
) returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_old   public.tools%rowtype;
  v_status text;
  v_clear  boolean;
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

  v_status := case when v_old.status = 'approved' then 'pending' else v_old.status end;

  v_clear := public.normalize_domain(p_website_url) is distinct from v_old.canonical_domain
          or lower(nullif(btrim(p_owner_email), '')) is distinct from v_old.owner_email;

  update public.tools set
    name          = p_name,
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

  return v_status;
end;
$$;
