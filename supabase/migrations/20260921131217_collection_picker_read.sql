-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260921131217. History: never edit.

-- What the Save picker reads: your collections, and whether this thing is in each.
--
-- ONE QUERY RATHER THAN ONE PER COLLECTION. The picker needs a tick per row, and
-- asking "is it in this one" per collection is the N+1 that makes a modal feel
-- slow on the tap that opens it.
--
-- SECURITY INVOKER. uc_select_auth already limits the rows to public collections
-- and your own, and the user_id filter below narrows that to yours alone, so the
-- policy is the control and this is the projection. A definer here would be
-- reaching for privileges the caller already has.
create or replace function public.my_collections_for(
  p_entity_type text,
  p_entity_id uuid
)
returns table (
  id uuid,
  name text,
  description text,
  is_public boolean,
  item_count integer,
  contains boolean,
  created_at timestamptz
)
language sql
stable
set search_path to 'public'
as $$
  select
    c.id, c.name, c.description, c.is_public, c.item_count,
    exists (
      select 1 from public.user_collection_items i
      where i.collection_id = c.id
        and case p_entity_type
              when 'tool'  then i.tool_id  = p_entity_id
              when 'model' then i.model_id = p_entity_id
              when 'post'  then i.post_id  = p_entity_id
              else false
            end
    ) as contains,
    c.created_at
  from public.user_collections c
  where c.user_id = (select auth.uid())
    and (select auth.uid()) is not null
    and c.deleted_at is null
    and p_entity_type in ('tool', 'model', 'post')
  order by c.created_at desc
  limit 100;
$$;

revoke all on function public.my_collections_for(text, uuid) from public, anon;
grant execute on function public.my_collections_for(text, uuid) to authenticated;

-- Is this thing in your plain saved list? One answer for all three kinds, so the
-- picker's first row does not need three code paths in the client.
create or replace function public.is_saved(p_entity_type text, p_entity_id uuid)
returns boolean
language sql
stable
set search_path to 'public'
as $$
  select case p_entity_type
    when 'tool' then exists (
      select 1 from public.user_saved_tools s
      where s.user_id = (select auth.uid()) and s.tool_id = p_entity_id)
    when 'model' then exists (
      select 1 from public.user_saved_models s
      where s.user_id = (select auth.uid()) and s.model_id = p_entity_id)
    when 'post' then exists (
      select 1 from public.saves s
      where s.user_id = (select auth.uid()) and s.entity_type = 'post'
        and s.entity_id = p_entity_id)
    else false
  end;
$$;

revoke all on function public.is_saved(text, uuid) from public, anon;
grant execute on function public.is_saved(text, uuid) to authenticated;
