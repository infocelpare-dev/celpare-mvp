-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260921131240. History: never edit.

-- Put a thing in a collection, or take it out. One statement either way.
--
-- AN RPC RATHER THAN A READ THEN A WRITE. "Is it there? No, insert it" is two
-- round trips with a race between them: two taps in quick succession both read
-- absent and the second insert hits the unique index as an error rather than as a
-- no-op. Here the decision and the write are the same statement.
--
-- SECURITY INVOKER, so uci_insert_own and uci_delete_own decide, both of which
-- require the collection to belong to auth.uid() and not be deleted. This function
-- grants nothing: it is the caller's own privileges, used once instead of twice.
create or replace function public.toggle_collection_item(
  p_collection_id uuid,
  p_entity_type text,
  p_entity_id uuid
)
returns boolean
language plpgsql
set search_path to 'public'
as $$
declare
  v_deleted int;
begin
  if p_entity_type not in ('tool', 'model', 'post') then
    raise exception 'unknown_entity_type' using errcode = '22023';
  end if;

  delete from public.user_collection_items i
  where i.collection_id = p_collection_id
    and case p_entity_type
          when 'tool'  then i.tool_id  = p_entity_id
          when 'model' then i.model_id = p_entity_id
          when 'post'  then i.post_id  = p_entity_id
        end;

  get diagnostics v_deleted = row_count;
  if v_deleted > 0 then
    return false;
  end if;

  insert into public.user_collection_items (collection_id, tool_id, model_id, post_id)
  values (
    p_collection_id,
    case when p_entity_type = 'tool'  then p_entity_id end,
    case when p_entity_type = 'model' then p_entity_id end,
    case when p_entity_type = 'post'  then p_entity_id end
  );

  return true;
end;
$$;

revoke all on function public.toggle_collection_item(uuid, text, uuid) from public, anon;
grant execute on function public.toggle_collection_item(uuid, text, uuid) to authenticated;

-- The plain saved list, one door for all three kinds.
create or replace function public.toggle_saved(p_entity_type text, p_entity_id uuid)
returns boolean
language plpgsql
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_deleted int;
begin
  if v_uid is null then
    raise exception 'not_authorised' using errcode = '42501';
  end if;

  if p_entity_type = 'tool' then
    delete from public.user_saved_tools where user_id = v_uid and tool_id = p_entity_id;
    get diagnostics v_deleted = row_count;
    if v_deleted > 0 then return false; end if;
    -- ust_plan_cap fires here and raises plan_limit_reached:saved_tools:N when
    -- the plan is full. The caller turns that into a sentence.
    insert into public.user_saved_tools (user_id, tool_id) values (v_uid, p_entity_id);
    return true;

  elsif p_entity_type = 'model' then
    delete from public.user_saved_models where user_id = v_uid and model_id = p_entity_id;
    get diagnostics v_deleted = row_count;
    if v_deleted > 0 then return false; end if;
    insert into public.user_saved_models (user_id, model_id) values (v_uid, p_entity_id);
    return true;

  elsif p_entity_type = 'post' then
    delete from public.saves
     where user_id = v_uid and entity_type = 'post' and entity_id = p_entity_id;
    get diagnostics v_deleted = row_count;
    if v_deleted > 0 then return false; end if;
    insert into public.saves (user_id, entity_type, entity_id)
    values (v_uid, 'post', p_entity_id);
    return true;
  end if;

  raise exception 'unknown_entity_type' using errcode = '22023';
end;
$$;

revoke all on function public.toggle_saved(text, uuid) from public, anon;
grant execute on function public.toggle_saved(text, uuid) to authenticated;
