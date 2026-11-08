-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260914142808. History: never edit.

-- Narrowing the tools grant in developer_submissions_foundation broke
-- search_tools, which is how Ask Celpare reads the catalogue.
--
-- The cause is worth writing down, because it is the trap in column level
-- grants generally: search_tools does `select t.*`, and `t.*` needs SELECT on
-- EVERY column, not just the ones the function returns. The new grant listed
-- 24 of the 25 columns and omitted search_vector, so an anonymous call failed
-- with "permission denied for table tools" and the assistant lost the
-- catalogue entirely.
--
-- search_vector is a generated tsvector built from name, tagline, tags,
-- features and description, all of which are already public on an approved
-- tool, so granting SELECT on it exposes nothing new.
--
-- The function stays SECURITY INVOKER, per D39: the signature is the column
-- allowlist and RLS is what limits the rows. That property is unchanged.

grant select (search_vector) on public.tools to anon, authenticated;
