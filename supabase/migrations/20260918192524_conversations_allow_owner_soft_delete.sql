-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260918192524. History: never edit.

-- conversations_own was FOR ALL. An ALL policy applies its USING expression to
-- the new row as well as the existing one, and that expression carries
-- "deleted_at is null". A soft delete sets deleted_at, so the new row failed
-- the policy that was meant to protect it and Postgres refused the update with
-- 42501. deleteConversation has been unusable since it was written in 4O; it
-- was never called until the history panel got a delete control, which is what
-- surfaced this.
--
-- Splitting the one ALL policy into its four commands changes nothing except
-- the expression applied to an updated row, which becomes ownership alone.
-- Every command keeps exactly the checks it had: you still cannot see, update
-- or delete somebody else's chat, and you still cannot touch a chat that is
-- already deleted.

drop policy if exists conversations_own on public.conversations;

create policy conversations_select_own on public.conversations
  for select to authenticated
  using ((select auth.uid()) = user_id and deleted_at is null);

create policy conversations_insert_own on public.conversations
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy conversations_update_own on public.conversations
  for update to authenticated
  using ((select auth.uid()) = user_id and deleted_at is null)
  with check ((select auth.uid()) = user_id);

create policy conversations_delete_own on public.conversations
  for delete to authenticated
  using ((select auth.uid()) = user_id);
