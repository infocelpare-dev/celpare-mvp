-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260921150918. History: never edit.

-- Saving means filing into a collection, and tg_mirror_collection_save keeps the
-- saved tables in step with that. A function that writes them directly would
-- create a saved row belonging to no collection, which the mirror would never
-- correct, so the two would disagree and the collection, the source of truth,
-- would be the one that looked wrong.
--
-- is_saved STAYS. It only reads, and it answers the question a page asks when it
-- renders a bookmark: is this in anything of mine.
drop function if exists public.toggle_saved(text, uuid);
