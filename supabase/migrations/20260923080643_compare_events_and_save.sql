-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260923080643. History: never edit.

-- Compare analytics. Closed like search_result_events: no client grant at all,
-- written only by the server with the service role, read by nothing yet.
-- Recorded for the later Compare Intelligence phase; no ranking reads it.
create table public.compare_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  event text not null check (event in (
    'comparison_started', 'comparison_viewed', 'comparison_completed', 'comparison_abandoned',
    'item_added', 'item_removed', 'item_reordered',
    'section_viewed', 'source_opened',
    'tool_opened_from_comparison', 'model_opened_from_comparison',
    'save_comparison', 'share_comparison', 'add_to_collection', 'ask_celpare_from_comparison',
    'goal_selected'
  )),
  item_type text check (item_type is null or item_type in ('tool', 'model')),
  item_id uuid,
  item_count smallint check (item_count is null or item_count between 0 and 12),
  position smallint check (position is null or position between 0 and 11),
  section text check (section is null or section ~ '^[a-z_]{1,40}$'),
  goal text check (goal is null or goal ~ '^[a-z_]{1,40}$'),
  signature text check (signature is null or char_length(signature) <= 400),
  created_at timestamptz not null default now(),
  constraint compare_events_item_pair check ((item_type is null) = (item_id is null))
);
create index idx_compare_events_created on public.compare_events (created_at desc);
create index idx_compare_events_event on public.compare_events (event, created_at desc);
alter table public.compare_events enable row level security;
revoke all on public.compare_events from anon, authenticated;

-- Save a comparison. A comparison IS an ordered set of tools and models, which
-- is exactly what a collection already holds, so this is a collection and not a
-- second storage system. Runs as the CALLER: uc_insert_own, uci_insert_own and
-- the plan cap trigger all still apply.
create or replace function public.create_collection_from_items(
  p_name text,
  p_description text,
  p_is_public boolean,
  p_items jsonb
) returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_item jsonb;
  v_pos int := 0;
  v_type text;
  v_entity uuid;
begin
  if v_uid is null then
    raise exception 'not_authorised' using errcode = '42501';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 2 or jsonb_array_length(p_items) > 12 then
    raise exception 'compare_item_count' using errcode = '22023';
  end if;

  insert into public.user_collections (user_id, name, description, is_public)
  values (v_uid, btrim(p_name), nullif(btrim(coalesce(p_description, '')), ''), coalesce(p_is_public, false))
  returning id into v_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_type := v_item->>'type';
    v_entity := (v_item->>'id')::uuid;
    -- Only what is public may be filed. The FK alone would accept a draft id,
    -- and RLS would show the caller their OWN drafts, so the status is tested.
    if v_type = 'tool' then
      if not exists (select 1 from public.tools where id = v_entity and status = 'approved') then
        raise exception 'compare_item_unavailable' using errcode = '22023';
      end if;
      insert into public.user_collection_items (collection_id, tool_id, sort_order)
      values (v_id, v_entity, v_pos);
    elsif v_type = 'model' then
      if not exists (select 1 from public.models where id = v_entity and status = 'approved') then
        raise exception 'compare_item_unavailable' using errcode = '22023';
      end if;
      insert into public.user_collection_items (collection_id, model_id, sort_order)
      values (v_id, v_entity, v_pos);
    else
      raise exception 'unknown_entity_type' using errcode = '22023';
    end if;
    v_pos := v_pos + 1;
  end loop;

  return v_id;
end;
$$;
revoke all on function public.create_collection_from_items(text, text, boolean, jsonb) from public, anon;
grant execute on function public.create_collection_from_items(text, text, boolean, jsonb) to authenticated;
