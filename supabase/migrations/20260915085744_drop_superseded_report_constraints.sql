-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260915085744. History: never edit.

-- The reports extension was silently inert, and testing is the only reason this
-- was found.
--
-- The original constraints were named reports_status_ok, reports_entity_type_ok
-- and reports_reason_ok. The migration that widened them wrote
-- "drop constraint if exists reports_status_check" first, which matched nothing,
-- and then added a second, wider constraint beside the original. Postgres
-- applies every check constraint on a table, so the narrow one still decided:
-- 'investigating' was refused, and so was every entity type beyond post and
-- comment, and the two new reasons.
--
-- Nothing had noticed because the widened values are only reachable from the new
-- admin surfaces, and "drop if exists" is silent by design when the name is
-- wrong. The lesson for next time is to read the constraint names out of
-- pg_constraint rather than assuming Postgres's default naming: these were
-- written by hand with an _ok suffix.
--
-- The wider constraints added by that migration are correct and stay. Only the
-- superseded originals are removed here.
alter table public.reports drop constraint if exists reports_status_ok;
alter table public.reports drop constraint if exists reports_entity_type_ok;
alter table public.reports drop constraint if exists reports_reason_ok;
