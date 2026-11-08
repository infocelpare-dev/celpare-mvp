-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260921131301. History: never edit.

-- Create a collection and put the thing in it, atomically.
--
-- The founder's flow ends "after creation, automatically select the new collection
-- and save the tool to it". Two calls would let the first succeed and the second
-- fail, leaving an empty collection the person did not ask for and, on a free
-- account, having spent their only one. One function, one transaction: either
-- both rows exist or neither does.
--
-- SECURITY INVOKER. uc_insert_own requires user_id = auth.uid() and uc_plan_cap
-- raises plan_limit_reached when the plan is full, so the cap is enforced by the
-- same trigger whatever route the insert takes.
create or replace function public.create_collection_with_item(
  p_name text,
  p_description text,
  p_is_public boolean,
  p_entity_type text,
  p_entity_id uuid
)
returns uuid
language plpgsql
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authorised' using errcode = '42501';
  end if;
  if p_entity_type not in ('tool', 'model', 'post') then
    raise exception 'unknown_entity_type' using errcode = '22023';
  end if;

  insert into public.user_collections (user_id, name, description, is_public)
  values (
    v_uid,
    btrim(p_name),
    nullif(btrim(coalesce(p_description, '')), ''),
    coalesce(p_is_public, false)
  )
  returning id into v_id;

  insert into public.user_collection_items (collection_id, tool_id, model_id, post_id)
  values (
    v_id,
    case when p_entity_type = 'tool'  then p_entity_id end,
    case when p_entity_type = 'model' then p_entity_id end,
    case when p_entity_type = 'post'  then p_entity_id end
  );

  return v_id;
end;
$$;

revoke all on function public.create_collection_with_item(text, text, boolean, text, uuid) from public, anon;
grant execute on function public.create_collection_with_item(text, text, boolean, text, uuid) to authenticated;
