-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260914144337. History: never edit.

-- Revoking EXECUTE on is_client_role broke every client insert into tools and
-- models with "permission denied for function is_client_role".
--
-- The reason is worth recording: a trigger's WHEN clause is evaluated as the
-- CALLING role, not as the trigger owner. So a function used to gate a trigger
-- must be executable by exactly the roles whose writes it is meant to gate.
-- Revoking it did not harden anything, it simply stopped the guard running and
-- took the write path down with it.
--
-- The search_path pin from the previous migration is the part that mattered
-- and it stays. Exposing this function is harmless: it takes no arguments,
-- reads no data, and returns whether the caller is already a client role,
-- which the caller necessarily knows.
grant execute on function public.is_client_role() to authenticated, anon;
