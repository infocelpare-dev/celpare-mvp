-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260921150447. History: never edit.

-- SAVED NOW MEANS "IN AT LEAST ONE COLLECTION".
--
-- Founder instruction 2026-09-21: the picker is collections only. There is no
-- separate saved list to tick, so a tool, a model or a post is saved by being put
-- in a collection and unsaved by leaving every one of them.
--
-- That leaves three surfaces built on the plain saved tables with nothing writing
-- to them: posts.save_count, which the feed shows beside the bookmark; the Tools,
-- Models and Saved tabs on a profile; and the saved_tools and saved_models plan
-- caps, which are the founder's "5 saves" on free. Rather than delete three
-- working features or leave them frozen at zero, the membership is MIRRORED into
-- them, so "saved" is a derived fact with one source of truth: the collection.
--
-- It is a trigger rather than application code for the usual reason: a row can be
-- added to a collection from the picker, from an RPC or by hand, and the mirror
-- must be true in all three cases.
--
-- SECURITY DEFINER because it writes rows the caller reaches only through their
-- own policies anyway, and the search_path is pinned. The plan cap triggers on
-- those tables STILL FIRE, which is deliberate: that is what makes "5 saves" real
-- for somebody filing their sixth tool into a collection.
create or replace function public.tg_mirror_collection_save()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_owner uuid;
  v_tool uuid;
  v_model uuid;
  v_post uuid;
  v_still boolean;
begin
  if tg_op = 'INSERT' then
    v_tool := new.tool_id; v_model := new.model_id; v_post := new.post_id;
    select user_id into v_owner from public.user_collections where id = new.collection_id;
  else
    v_tool := old.tool_id; v_model := old.model_id; v_post := old.post_id;
    select user_id into v_owner from public.user_collections where id = old.collection_id;
  end if;

  if v_owner is null then
    -- The collection went with a cascade. Nothing to mirror onto.
    return coalesce(new, old);
  end if;

  -- Is this thing in ANY of that person's collections now? Leaving one
  -- collection while still in another must not unsave it.
  select exists (
    select 1
    from public.user_collection_items i
    join public.user_collections c on c.id = i.collection_id
    where c.user_id = v_owner
      and c.deleted_at is null
      and (
        (v_tool  is not null and i.tool_id  = v_tool)  or
        (v_model is not null and i.model_id = v_model) or
        (v_post  is not null and i.post_id  = v_post)
      )
  ) into v_still;

  if v_tool is not null then
    if v_still then
      insert into public.user_saved_tools (user_id, tool_id)
      values (v_owner, v_tool) on conflict do nothing;
    else
      delete from public.user_saved_tools where user_id = v_owner and tool_id = v_tool;
    end if;
  elsif v_model is not null then
    if v_still then
      insert into public.user_saved_models (user_id, model_id)
      values (v_owner, v_model) on conflict do nothing;
    else
      delete from public.user_saved_models where user_id = v_owner and model_id = v_model;
    end if;
  elsif v_post is not null then
    if v_still then
      insert into public.saves (user_id, entity_type, entity_id)
      values (v_owner, 'post', v_post) on conflict do nothing;
    else
      delete from public.saves
       where user_id = v_owner and entity_type = 'post' and entity_id = v_post;
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists uci_mirror_save on public.user_collection_items;
create trigger uci_mirror_save
after insert or delete on public.user_collection_items
for each row execute function public.tg_mirror_collection_save();

comment on function public.tg_mirror_collection_save() is
'Keeps user_saved_tools, user_saved_models and saves in step with collection membership, because saving IS filing since 2026-09-21 and those three tables back the post save count, the profile tabs and the per plan save caps. Leaving one collection while still in another does not unsave: the check is membership of ANY collection owned by the same person.';
