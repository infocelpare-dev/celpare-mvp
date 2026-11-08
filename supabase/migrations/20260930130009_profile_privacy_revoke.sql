-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260930130009. History: never edit.

-- D194 step 3. profiles_select_public is `true`, so column grants are the only
-- control on what one person can read about another. These were readable by
-- everybody:
--   written fields of PRIVATE accounts (bio, location, website, interests, skills)
--   plan and ask_settings of every account
--   status_reason, status_changed_at, suspended_until (moderation) of every account
-- Owners read their own through my_profile_private(); everybody reads written
-- fields through profile_written_fields(), which applies D86. account_status and
-- role stay readable: the admin screens and people lists filter on them.
revoke select (bio, location, website_url, interests, skills, plan, ask_settings)
  on public.profiles from anon, authenticated;
revoke select (status_reason, status_changed_at, suspended_until)
  on public.profiles from authenticated;
