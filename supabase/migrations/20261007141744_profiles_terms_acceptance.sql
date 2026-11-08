-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20261007141744. History: never edit.

-- Which Terms and Privacy version an account accepted, and when (phase LEGAL,
-- 2026-10-07). Written by the server on the service role when an account is
-- created; deliberately not granted to anon or authenticated (profiles is
-- granted column by column), so no client can read or forge it.
alter table public.profiles
  add column if not exists terms_version text,
  add column if not exists terms_accepted_at timestamptz;
