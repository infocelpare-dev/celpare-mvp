-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260921103112. History: never edit.

-- The two new tsvector columns on the PUBLIC catalogue tables are granted.
--
-- Not an oversight in the other direction either: search_tools has always read
-- tools.search_vector as the caller, which is what keeps RLS the control rather
-- than a definer function. models and posts get the same treatment so their
-- retrieval functions can stay SECURITY INVOKER.
--
-- It publishes nothing new. A tsvector is derived from columns that are already
-- granted (name, provider, tags, modalities, description; body for a post), so
-- anyone who can read the row can already reconstruct it.
--
-- profiles.search_vector is deliberately NOT granted: it contains the same
-- words but the people search has to filter on account_status, which no client
-- role may read, so that function is SECURITY DEFINER with a fixed projection.
grant select (search_vector) on public.models to anon, authenticated;
grant select (search_vector) on public.posts to anon, authenticated;
