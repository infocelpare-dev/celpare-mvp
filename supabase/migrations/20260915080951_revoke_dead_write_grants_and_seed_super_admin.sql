-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260915080951. History: never edit.

-- G40: ten tables carry write grants that no policy permits.
--
-- Every new table in public inherits arwdDxtm for anon and authenticated from a
-- default ACL, and the older migrations granted rather than revoking first. None
-- of these is exploitable today, because RLS refuses the write for want of a
-- policy: a grant with no policy behind it is a door with no handle. It is still
-- one control instead of two, and adding a policy later is how the handle gets
-- fitted by accident.
--
-- Each revoke below is checked against the policies on that table, so this is a
-- defence in depth change with no behavioural effect.

-- Only a SELECT policy exists. Real rows are written by the service role client
-- in src/lib/ai/usage.ts, which is unaffected by a grant to anon.
revoke insert, update, delete, truncate, references, trigger
  on public.ai_usage_records from anon, authenticated;

-- Read only catalogue data. Only SELECT policies exist.
revoke insert, update, delete, truncate, references, trigger
  on public.categories, public.tool_categories, public.tool_terms
  from anon, authenticated;

-- INSERT stays: the landing forms post to these and have an INSERT policy.
-- Nothing else is permitted by any policy.
revoke update, delete, truncate, references, trigger
  on public.demo_requests, public.waitlist_users, public.waitlist_founders
  from anon, authenticated;

-- profiles has an UPDATE policy with a column limited grant, which stays exactly
-- as it is. INSERT and DELETE have no policy: rows are created by the
-- handle_new_user trigger on auth.users.
revoke insert, delete, truncate, references, trigger
  on public.profiles from anon, authenticated;

-- conversations_own and messages_own are FOR ALL, so INSERT, UPDATE and DELETE
-- are all genuinely used and stay. The other three never were.
revoke truncate, references, trigger
  on public.conversations, public.messages from anon, authenticated;


/* ------------------------------------------------------ first super admin */

-- The dashboard needs one account that can reach it, and admin_set_user_role
-- deliberately refuses to promote anybody without an existing super admin. That
-- circularity is broken here, once, for the founder's own account.
--
-- Keyed on the email rather than a pasted uuid, and written as an update to a
-- row that must already exist: if the account is not there this changes nothing
-- rather than inventing a super admin.
update public.profiles
   set role = 'super_admin', updated_at = now()
 where email = 'infocelpare@gmail.com'
   and role = 'user';

insert into public.admin_audit_log
  (actor_id, actor_role, action, entity_type, entity_id, entity_label, reason,
   before_state, after_state)
select id, 'system', 'user.role_changed', 'user', id::text, username::text,
       'Bootstrap: the first super admin, granted by migration. No super admin existed to grant it.',
       jsonb_build_object('role', 'user'), jsonb_build_object('role', 'super_admin')
from public.profiles
where email = 'infocelpare@gmail.com' and role = 'super_admin';
