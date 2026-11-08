-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260923145340. History: never edit.

-- Chats are signed in only (D36: anonymous chats are never saved). No anon policy
-- existed, so this closes a grant nothing used.
revoke all on public.conversations from anon;
revoke all on public.messages from anon;

-- The waitlist tables were retired by D20 and hold no rows, yet anyone holding the
-- public key could still insert into them without limit. Closed, not dropped.
drop policy if exists waitlist_users_anon_insert on public.waitlist_users;
drop policy if exists waitlist_founders_anon_insert on public.waitlist_founders;
revoke all on public.waitlist_users from anon, authenticated;
revoke all on public.waitlist_founders from anon, authenticated;

-- Demo requests: a caller may supply the email and nothing else. source and
-- created_at come from their defaults, and nobody can read the list back.
revoke all on public.demo_requests from anon, authenticated;
grant insert (email) on public.demo_requests to anon, authenticated;
alter table public.demo_requests
  add constraint demo_requests_email_length check (char_length(email::text) <= 254),
  add constraint demo_requests_source_length check (char_length(source) <= 40);
-- The action already treats 23505 as "already asked"; this is what makes it true.
create unique index if not exists demo_requests_email_key on public.demo_requests (email);
