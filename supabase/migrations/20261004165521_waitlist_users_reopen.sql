-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20261004165521. History: never edit.

-- D198: the pre launch waitlist reopens as one section of the marketing page.
-- Same shape as demo_requests: insert on the email column only, nobody reads.
revoke all on public.waitlist_users from anon, authenticated;
grant insert (email) on public.waitlist_users to anon, authenticated;
drop policy if exists waitlist_users_insert on public.waitlist_users;
create policy waitlist_users_insert on public.waitlist_users
  for insert to anon, authenticated with check (true);
