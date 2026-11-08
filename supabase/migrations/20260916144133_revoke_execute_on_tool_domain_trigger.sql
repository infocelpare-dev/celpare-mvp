-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260916144133. History: never edit.

-- pg_default_acl grants EXECUTE on every new function to anon and
-- authenticated, so tg_tool_domain was reachable as /rest/v1/rpc/tg_tool_domain
-- by a signed out visitor. Every other tg_ function in this database has that
-- revoked; this one was new and inherited the default.
--
-- A trigger function does not need EXECUTE to fire. The grant only matters for
-- calling it directly, which is exactly what should be impossible. (Different
-- from a function used in a trigger's WHEN clause, which does run as the
-- calling role and does need the grant.)

revoke all on function public.tg_tool_domain() from public, anon, authenticated;
