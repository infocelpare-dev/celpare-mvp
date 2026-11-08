-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260915085409. History: never edit.

-- reports.resolved_by and reports.resolved_at were never in the client SELECT
-- grant, so reading a report row whole fails with 42501 even for a moderator.
-- Found by testing the reports centre.
--
-- Granted rather than worked around: reports_select_auth already decides WHICH
-- rows anyone can see, which is their own or, for a moderator, all of them.
-- A person who filed a report being able to see that it was dealt with, and
-- when, is the right behaviour rather than a leak. Who resolved it is a staff
-- id, which is already public on profiles.
grant select (resolved_by, resolved_at) on public.reports to authenticated;
