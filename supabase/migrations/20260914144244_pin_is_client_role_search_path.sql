-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260914144244. History: never edit.

-- The advisor is right. is_client_role is not SECURITY DEFINER, so it runs as
-- the caller and the exposure is small, but it is used in a trigger WHEN
-- clause that decides whether the submission guard fires at all. A function
-- that gates a security control should not be resolvable through a caller
-- controlled search_path. Pinned, like every other function in this schema.
create or replace function public.is_client_role()
returns boolean
language sql
stable
set search_path = pg_catalog
as $$
  select current_user in ('authenticated', 'anon');
$$;

revoke all on function public.is_client_role() from public, anon, authenticated;
