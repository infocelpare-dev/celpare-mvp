-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20261005130954. History: never edit.

-- D204 revised by the founder the same day: no request flow. Developers see
-- the offer on /pricing/sponsored as Coming soon; runs start from payments
-- (Phase 7). The request and accept functions go, so nothing can create a
-- pending row through the API.
drop function if exists public.request_tool_sponsorship(uuid, text);
drop function if exists public.admin_decide_tool_sponsorship(uuid, text, text, integer);
