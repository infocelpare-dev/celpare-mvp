-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260917172407. History: never edit.

-- One tool profile is now four writes: the tool, its categories, its links and
-- its media. Doing them as four PostgREST calls means a failure on the third
-- leaves a half built draft behind, and there is no way back from that: there
-- is no DELETE grant or DELETE policy on public.tools, so a developer cannot
-- remove their own wreckage and neither can the server action. The draft would
-- sit in My Tools permanently, unfinished and un-deletable.
--
-- So the four writes happen in one transaction, which is what a function gives
-- for free.
--
-- SECURITY INVOKER, deliberately and importantly. This function grants NOTHING.
-- Every insert inside it is checked against the caller's own column grants and
-- the same RLS policies that would have applied from PostgREST:
--   tools            tools_insert_developer, plus tg_submission_guard forcing
--                    status, developer_id, source and submitted_at whatever
--                    was passed here
--   tool_categories  tool_categories_write  -> may_edit_tool()
--   tool_links       tool_links_write       -> may_edit_tool()
--   tool_media       tool_media_write       -> may_edit_tool()
-- A SECURITY DEFINER version of this would have been a way to write a tool
-- somebody else owns, which is exactly what D77 built three separate controls
-- to prevent.
--
-- may_edit_tool() reads the row this function just inserted, inside the same
-- transaction, so status is 'draft' and developer_id is the caller by the time
-- the child inserts are checked.

create or replace function public.create_tool_draft(
  p_slug           text,
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
  p_media          jsonb,
  p_send_for_review boolean
) returns uuid
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_id uuid;
begin
  insert into public.tools (
    slug, name, tagline, description, website_url, docs_url, logo_url,
    pricing, pricing_model, tags, owner_email
  ) values (
    p_slug, p_name, p_tagline, p_description, p_website_url, p_docs_url,
    p_logo_url, p_pricing, p_pricing_model, coalesce(p_tags, '{}'), p_owner_email
  )
  returning id into v_id;

  insert into public.tool_categories (tool_id, category_id)
  select v_id, c from unnest(coalesce(p_categories, '{}'::uuid[])) as c;

  insert into public.tool_links (tool_id, kind, url)
  select v_id, e->>'kind', e->>'url'
  from jsonb_array_elements(coalesce(p_links, '[]'::jsonb)) as e;

  insert into public.tool_media (tool_id, kind, url, caption, sort_order)
  select v_id, e->>'kind', e->>'url',
         nullif(e->>'caption', ''),
         coalesce((e->>'sort_order')::smallint, 0)
  from jsonb_array_elements(coalesce(p_media, '[]'::jsonb)) as e;

  -- Sending for review is part of the same transaction on purpose. "Submit
  -- Tool" must not be able to leave a draft that was never sent, and
  -- submit_for_review re-checks ownership, state, owner_email and
  -- is_active_account() itself, so this borrows none of its judgement.
  if p_send_for_review then
    perform public.submit_for_review('tool', v_id);
  end if;

  return v_id;
end;
$$;

-- Rule 6 in its function form: pg_default_acl hands EXECUTE on every new
-- function to anon and authenticated. Revoke first, then name who may call it.
revoke all on function public.create_tool_draft(
  text, text, text, text, text, text, text, text, text, text[], text, uuid[],
  jsonb, jsonb, boolean
) from public, anon, authenticated;

grant execute on function public.create_tool_draft(
  text, text, text, text, text, text, text, text, text, text[], text, uuid[],
  jsonb, jsonb, boolean
) to authenticated;
