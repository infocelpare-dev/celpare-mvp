-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260917191305. History: never edit.

-- Owner editing, which 4U.5 left open and the founder asked for on 2026-09-17.
-- Until now there was no edit path at all: "Edit tool" on a public profile
-- linked to the My Tools LIST, and My Tools told a developer whose submission
-- had been sent back to "edit it, then send it again" with nothing to press.
--
-- FOUNDER DECISION, same day: any edit to an approved listing sends it back to
-- review, and it leaves the public catalogue until it is approved again. That
-- is what keeps "approved" meaning somebody looked at the content that is
-- actually public, rather than at whatever was there on the day.
--
-- SECURITY DEFINER, and unlike create_tool_draft that is deliberate.
--
-- An INVOKER version cannot do this job. The status change is the whole point
-- and status is in no client grant; tools_update_own_draft refuses an approved
-- row outright; and may_edit_tool() gates the child tables on the status that
-- this function is in the middle of changing, so the child writes and the
-- parent update would fight over the order they ran in.
--
-- So this borrows no judgement from the caller. It re-checks, from scratch:
--   * the caller is an active developer, which folds in is_active_account()
--   * the caller OWNS this tool
--   * the tool is in a state its owner may edit
-- and it takes no status, verified, developer_id or source from the caller,
-- because they are not parameters. This is the shape submit_for_review already
-- uses for the same reason.

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

  -- Pending is excluded on purpose: it is in the review queue and editing it
  -- under the reviewer would change what they are deciding on. Rejected is
  -- excluded because that decision is final for the submission.
  if v_old.status not in ('draft', 'changes_required', 'approved') then
    raise exception 'wrong_state' using errcode = '42501';
  end if;

  -- An approved listing goes back to the queue and leaves the catalogue.
  -- Anything else keeps the state it was in; a draft stays a draft, and one
  -- sent back for changes stays that way until its owner sends it again.
  v_status := case when v_old.status = 'approved' then 'pending' else v_old.status end;

  /*
    Verification is a statement about one address on one domain, so changing
    either throws it away. tg_submission_guard says exactly this, and it does
    NOT fire here: its WHEN clause is is_client_role(), and inside a definer
    function current_user is the owner. So the rule is repeated rather than
    inherited, which is worth knowing if that one is ever changed.

    tg_tool_domain has no WHEN clause, so it still fires and still refuses a
    free provider, a mismatch, or an email with no website. That one is not
    repeated because it is not bypassed.
  */
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

  -- Children are replaced rather than merged. The form posts the whole set
  -- every time, so a row that is gone from it is a row the owner removed.
  delete from public.tool_categories where tool_id = p_id;
  delete from public.tool_links      where tool_id = p_id;
  delete from public.tool_media      where tool_id = p_id;

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

  -- Which state it ended in, so the page can say what actually happened
  -- rather than guessing.
  return v_status;
end;
$$;

-- Rule 6 in its function form: pg_default_acl hands EXECUTE on every new
-- function to anon and authenticated. Revoke first, then name who may call it.
revoke all on function public.update_tool(
  uuid, text, text, text, text, text, text, text, text, text[], text, uuid[],
  jsonb, jsonb
) from public, anon, authenticated;

grant execute on function public.update_tool(
  uuid, text, text, text, text, text, text, text, text, text[], text, uuid[],
  jsonb, jsonb
) to authenticated;
