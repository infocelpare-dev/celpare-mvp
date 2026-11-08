-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260918192748. History: never edit.

-- Soft deleting a chat was impossible from the client, and no UPDATE policy
-- could have fixed it. On an UPDATE, PostgreSQL applies the table's SELECT
-- policy to the NEW row as well: the row has to stay visible to whoever
-- changed it. conversations_select_own requires "deleted_at is null", so the
-- moment deleted_at is set the new row fails that read check and the update is
-- rejected with 42501. Proven by experiment: dropping only that one condition
-- from the SELECT policy let the same update through.
--
-- Two ways out. Dropping "deleted_at is null" from the read policy would put
-- the soft delete filter back on the application, where every current and
-- future query would have to remember it, and one forgotten filter puts
-- deleted chats back on screen. So instead the write goes through one function
-- that runs as the owner and states the ownership rule itself.
--
-- This is not the service role and does not contradict D21: no key that
-- bypasses everything is in play, the predicate is fixed in the function body,
-- and the only thing it can do is stamp deleted_at on a row belonging to the
-- caller. search_path is pinned so the body cannot be redirected at a
-- shadowing schema.

-- Undo the policy split from the previous migration: it was behaviour
-- identical for the other three commands and did not fix this, so the table
-- goes back to the single policy it had.
drop policy if exists conversations_select_own on public.conversations;
drop policy if exists conversations_insert_own on public.conversations;
drop policy if exists conversations_update_own on public.conversations;
drop policy if exists conversations_delete_own on public.conversations;

create policy conversations_own on public.conversations
  for all to authenticated
  using ((select auth.uid()) = user_id and deleted_at is null)
  with check ((select auth.uid()) = user_id);

create or replace function public.delete_conversation(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  touched int;
begin
  update public.conversations
     set deleted_at = now()
   where id = p_id
     and user_id = (select auth.uid())
     and deleted_at is null;
  get diagnostics touched = row_count;
  return touched > 0;
end;
$$;

revoke all on function public.delete_conversation(uuid) from public;
revoke all on function public.delete_conversation(uuid) from anon;
grant execute on function public.delete_conversation(uuid) to authenticated;
