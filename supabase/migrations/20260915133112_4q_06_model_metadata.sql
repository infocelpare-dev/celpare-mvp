-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260915133112. History: never edit.

-- Phase 4Q.5. Model metadata becomes editable.
--
-- Brief section 6 asks for management of model metadata and platform
-- availability. Phase 4P gave models a list, a detail page and a status
-- decision through admin_review_submission, and nothing else: a wrong context
-- window or a stale price could only be fixed in the SQL editor. Prices in
-- particular go stale on their own, and the AI analytics cost estimate reads
-- them.
--
-- Metadata only. Nothing here touches provider credentials, because there are
-- none in this table: `provider` is a label like 'openai', not a key. The keys
-- are environment variables the database has never seen.

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
    raise exception 'no such model' using errcode = '22023';
  end if;

  p_name := nullif(btrim(coalesce(p_name, '')), '');
  p_provider := nullif(btrim(coalesce(p_provider, '')), '');
  if p_name is null or p_provider is null then
    raise exception 'name and provider are both required' using errcode = '22023';
  end if;

  -- Negative money and negative context are input errors, not opinions.
  if p_context_window is not null and p_context_window < 0 then
    raise exception 'context window cannot be negative' using errcode = '22023';
  end if;
  if coalesce(p_input_price_per_m, 0) < 0 or coalesce(p_output_price_per_m, 0) < 0 then
    raise exception 'prices cannot be negative' using errcode = '22023';
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

  -- The slug is deliberately absent from everything above. It is the model's
  -- public URL and renaming it silently breaks every link that points at it.
  perform public.admin_audit('model.update', 'model', p_id::text, p_name,
                             p_reason, v_before, v_after);
end;
$$;

revoke all on function public.admin_update_model(uuid, text, text, text, integer, numeric, numeric, text[], text, text)
  from public, anon, authenticated;
grant execute on function public.admin_update_model(uuid, text, text, text, integer, numeric, numeric, text[], text, text)
  to authenticated;
