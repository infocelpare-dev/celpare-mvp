-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260921111047. History: never edit.

-- RESUME rule 6, caught by the verification rather than by the code review.
--
-- pg_default_acl grants EXECUTE on every new function to anon AND authenticated,
-- and `revoke all from public` does not touch an explicit grant to anon. So the
-- four functions that answer only for auth.uid() were callable by anon, where
-- auth.uid() is null: my_recent_searches returned zero rows and the two deletes
-- raised 42501, so nothing leaked and nothing was destroyed. It is still the
-- wrong grant, and the rule is revoke before grant every time.
revoke execute on function public.my_recent_searches(integer) from anon;
revoke execute on function public.delete_my_search(text) from anon;
revoke execute on function public.clear_my_searches() from anon;
revoke execute on function public.my_search_affinity() from anon;
