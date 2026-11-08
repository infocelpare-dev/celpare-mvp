-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260923172614. History: never edit.

-- admin_audit writes an audit log row and has no capability check of its own:
-- it is meant to be called only from inside the admin_* routines, which run as
-- the owner. audit_hardening_grants_and_indexes (4AW) granted EXECUTE to
-- authenticated on every admin_* function and so, by accident, let any signed in
-- account write audit rows under its own id. Closed here. Checked first: no app
-- code calls it, and no row was written through it while it was open.
revoke execute on function public.admin_audit(text, text, text, text, text, jsonb, jsonb)
  from public, anon, authenticated;
