-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260915132857. History: never edit.

-- Phase 4Q.4. Categories and topics become manageable.
--
-- Brief section 20 asks for a configuration area covering categories and
-- hashtags. The tables existed, seeded by migration, and there was no way to
-- add, rename or reorder one without opening the SQL editor. Topics carry the
-- eleven launch slugs G19 is still waiting on, and a slug ends up in a URL, so
-- the rename path is the part that matters.
--
-- One pair of routines for both tables. They are the same shape, and two copies
-- of this would drift.
--
-- v_slug is declared text, not citext: citext lives in the extensions schema and
-- these functions pin search_path to public. The column is citext and the cast
-- happens on insert, so uniqueness stays case insensitive either way.

create or replace function public.admin_upsert_taxonomy(
  p_kind        text,
  p_id          uuid,
  p_slug        text,
  p_name        text,
  p_description text,
  p_sort_order  integer,
  p_reason      text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before jsonb;
  v_after  jsonb;
  v_id     uuid;
  v_slug   text;
begin
  perform public.admin_require('settings.manage');

  if p_kind not in ('category', 'topic') then
    raise exception 'unknown taxonomy: %', p_kind using errcode = '22023';
  end if;

  p_name := nullif(btrim(coalesce(p_name, '')), '');
  if p_name is null then
    raise exception 'a name is required' using errcode = '22023';
  end if;

  -- Slugs are lowercased and checked here rather than trusted from the form,
  -- because this one is public and permanent in a way the name is not.
  v_slug := lower(btrim(coalesce(p_slug, '')));
  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'slug must be lowercase letters, digits and single hyphens'
      using errcode = '22023';
  end if;

  p_sort_order := coalesce(p_sort_order, 0);
  p_description := nullif(btrim(coalesce(p_description, '')), '');

  if p_kind = 'category' then
    select to_jsonb(c) into v_before from public.categories c where c.id = p_id;
  else
    select to_jsonb(t) into v_before from public.topics t where t.id = p_id;
  end if;

  if p_id is not null and v_before is null then
    raise exception 'no such %', p_kind using errcode = '22023';
  end if;

  if p_kind = 'category' then
    if p_id is null then
      insert into public.categories (slug, name, description, sort_order)
      values (v_slug, p_name, p_description, p_sort_order)
      returning id into v_id;
    else
      update public.categories
         set slug = v_slug, name = p_name, description = p_description, sort_order = p_sort_order
       where id = p_id
      returning id into v_id;
    end if;
    select to_jsonb(c) into v_after from public.categories c where c.id = v_id;
  else
    if p_id is null then
      insert into public.topics (slug, name, description, sort_order)
      values (v_slug, p_name, p_description, p_sort_order)
      returning id into v_id;
    else
      update public.topics
         set slug = v_slug, name = p_name, description = p_description, sort_order = p_sort_order
       where id = p_id
      returning id into v_id;
    end if;
    select to_jsonb(t) into v_after from public.topics t where t.id = v_id;
  end if;

  perform public.admin_audit(
    case when p_id is null then 'taxonomy.create' else 'taxonomy.update' end,
    p_kind, v_id::text, p_name, p_reason, coalesce(v_before, '{}'::jsonb), v_after);

  return v_id;
end;
$$;

create or replace function public.admin_delete_taxonomy(
  p_kind   text,
  p_id     uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before jsonb;
  v_uses   integer;
  v_label  text;
begin
  perform public.admin_require('settings.manage');

  if p_kind not in ('category', 'topic') then
    raise exception 'unknown taxonomy: %', p_kind using errcode = '22023';
  end if;

  -- Refuses while anything points at it. A hard delete here would either break
  -- the foreign key or silently strip the classification off live content, and
  -- there is no undo for either. Emptying it first is the administrator's
  -- decision to make explicitly.
  if p_kind = 'category' then
    select to_jsonb(c), c.name into v_before, v_label from public.categories c where c.id = p_id;
    select count(*) into v_uses from public.tool_categories where category_id = p_id;
  else
    select to_jsonb(t), t.name into v_before, v_label from public.topics t where t.id = p_id;
    select count(*) into v_uses from public.posts where topic_id = p_id;
  end if;

  if v_before is null then
    raise exception 'no such %', p_kind using errcode = '22023';
  end if;

  if v_uses > 0 then
    raise exception '% is still used by % item(s)', p_kind, v_uses using errcode = '23503';
  end if;

  if p_kind = 'category' then
    delete from public.categories where id = p_id;
  else
    delete from public.topics where id = p_id;
  end if;

  perform public.admin_audit('taxonomy.delete', p_kind, p_id::text, v_label,
                             p_reason, v_before, '{}'::jsonb);
end;
$$;

revoke all on function public.admin_upsert_taxonomy(text, uuid, text, text, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.admin_upsert_taxonomy(text, uuid, text, text, text, integer, text)
  to authenticated;

revoke all on function public.admin_delete_taxonomy(text, uuid, text) from public, anon, authenticated;
grant execute on function public.admin_delete_taxonomy(text, uuid, text) to authenticated;
