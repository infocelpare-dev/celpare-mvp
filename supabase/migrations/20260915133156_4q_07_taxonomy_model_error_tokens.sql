-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260915133156. History: never edit.

-- The routines added in 4Q.4 and 4Q.5 raised prose. Every other admin routine
-- raises a stable token and lets src/app/actions/admin.ts decide the wording,
-- so that the sentence a person reads lives on the side that knows who is
-- reading it. Bringing these three into line.

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
    raise exception 'unknown_taxonomy' using errcode = '22023';
  end if;

  p_name := nullif(btrim(coalesce(p_name, '')), '');
  if p_name is null then
    raise exception 'name_required' using errcode = '22023';
  end if;

  v_slug := lower(btrim(coalesce(p_slug, '')));
  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'invalid_slug' using errcode = '22023';
  end if;

  p_sort_order := coalesce(p_sort_order, 0);
  p_description := nullif(btrim(coalesce(p_description, '')), '');

  if p_kind = 'category' then
    select to_jsonb(c) into v_before from public.categories c where c.id = p_id;
  else
    select to_jsonb(t) into v_before from public.topics t where t.id = p_id;
  end if;

  if p_id is not null and v_before is null then
    raise exception 'taxonomy_not_found' using errcode = '22023';
  end if;

  if p_kind = 'category' then
    if p_id is null then
      insert into public.categories (slug, name, description, sort_order)
      values (v_slug, p_name, p_description, p_sort_order) returning id into v_id;
    else
      update public.categories
         set slug = v_slug, name = p_name, description = p_description, sort_order = p_sort_order
       where id = p_id returning id into v_id;
    end if;
    select to_jsonb(c) into v_after from public.categories c where c.id = v_id;
  else
    if p_id is null then
      insert into public.topics (slug, name, description, sort_order)
      values (v_slug, p_name, p_description, p_sort_order) returning id into v_id;
    else
      update public.topics
         set slug = v_slug, name = p_name, description = p_description, sort_order = p_sort_order
       where id = p_id returning id into v_id;
    end if;
    select to_jsonb(t) into v_after from public.topics t where t.id = v_id;
  end if;

  perform public.admin_audit(
    case when p_id is null then 'taxonomy.create' else 'taxonomy.update' end,
    p_kind, v_id::text, p_name, p_reason, coalesce(v_before, '{}'::jsonb), v_after);

  return v_id;
exception
  when unique_violation then
    raise exception 'slug_taken' using errcode = '23505';
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
    raise exception 'unknown_taxonomy' using errcode = '22023';
  end if;

  if p_kind = 'category' then
    select to_jsonb(c), c.name into v_before, v_label from public.categories c where c.id = p_id;
    select count(*) into v_uses from public.tool_categories where category_id = p_id;
  else
    select to_jsonb(t), t.name into v_before, v_label from public.topics t where t.id = p_id;
    select count(*) into v_uses from public.posts where topic_id = p_id;
  end if;

  if v_before is null then
    raise exception 'taxonomy_not_found' using errcode = '22023';
  end if;

  if v_uses > 0 then
    raise exception 'taxonomy_in_use:%', v_uses using errcode = '23503';
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

create or replace function public.admin_update_model(
  p_id                 uuid,
  p_name               text,
  p_provider           text,
  p_description        text,
  p_context_window     integer,
  p_input_price_per_m  numeric,
  p_output_price_per_m numeric,
  p_modalities         text[],
  p_website_url        text,
  p_reason             text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before jsonb;
  v_after  jsonb;
begin
  perform public.admin_require('models.manage');

  select to_jsonb(m) into v_before from public.models m where m.id = p_id;
  if v_before is null then
    raise exception 'model_not_found' using errcode = '22023';
  end if;

  p_name := nullif(btrim(coalesce(p_name, '')), '');
  p_provider := nullif(btrim(coalesce(p_provider, '')), '');
  if p_name is null or p_provider is null then
    raise exception 'name_and_provider_required' using errcode = '22023';
  end if;

  if p_context_window is not null and p_context_window < 0 then
    raise exception 'invalid_context_window' using errcode = '22023';
  end if;
  if coalesce(p_input_price_per_m, 0) < 0 or coalesce(p_output_price_per_m, 0) < 0 then
    raise exception 'invalid_price' using errcode = '22023';
  end if;

  update public.models
     set name               = p_name,
         provider           = p_provider,
         description        = nullif(btrim(coalesce(p_description, '')), ''),
         context_window     = p_context_window,
         input_price_per_m  = p_input_price_per_m,
         output_price_per_m = p_output_price_per_m,
         modalities         = coalesce(p_modalities, modalities),
         website_url        = nullif(btrim(coalesce(p_website_url, '')), ''),
         updated_at         = now()
   where id = p_id;

  select to_jsonb(m) into v_after from public.models m where m.id = p_id;

  -- The slug is deliberately absent. It is the model's public URL and renaming
  -- it silently breaks every link that points at it.
  perform public.admin_audit('model.update', 'model', p_id::text, p_name,
                             p_reason, v_before, v_after);
end;
$$;
