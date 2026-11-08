-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260921131108. History: never edit.

-- Founder decision, 2026-09-21: a free account gets ONE collection.
--
-- It was zero, which made the Save picker a control most accounts could open and
-- not use: an empty list over a Create button that would raise plan_limit_reached
-- every time. One collection makes the flow real on every plan and leaves the
-- paid tiers their reason to exist.
--
-- The ladder the founder stated, and what is already true of each:
--   free     1 collection,  5 saves   (saves already 5)
--   pro      10 collections, 15 saves (already 10 and 15)
--   premium  unlimited both            (already null and null)
-- So only this one row changes.
--
-- NOTHING IN CODE ENFORCES THIS. uc_plan_cap on user_collections already calls
-- plan_limit(), which reads this table, so the cap moves the moment the row does.
-- That is why it is a data change and not a deploy.
update public.plan_limits
   set limit_value = 1
 where plan = 'free' and limit_key = 'collections';
