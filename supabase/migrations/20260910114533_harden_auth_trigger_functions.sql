-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260910114533. History: never edit.

-- Pin search_path so the function cannot be hijacked by a shadowing schema.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Both functions exist only to back triggers. Nothing should be able to call
-- them over the REST API, and handle_new_user is SECURITY DEFINER, so leaving
-- it callable would let any caller invoke it with elevated rights.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.touch_updated_at() from public, anon, authenticated;
