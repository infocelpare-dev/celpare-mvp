-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260916155233. History: never edit.

-- A policy expression runs AS THE CALLING ROLE, so every function it names has
-- to be executable by that role. tool_reviews_select named is_moderator(),
-- which anon cannot execute, so the whole review list failed at 42501 for
-- signed out visitors: "[tools] reviews failed 42501 permission denied for
-- function is_moderator".
--
-- Granting anon EXECUTE on is_moderator would fix it and widen a SECURITY
-- DEFINER function to the public internet to answer a question anon can never
-- answer yes to. Two policies instead, which is how tools already does it
-- (tools_select_anon and tools_select_auth).

drop policy if exists tool_reviews_select on public.tool_reviews;

create policy tool_reviews_select_anon on public.tool_reviews
  for select to anon
  using (status = 'visible');

create policy tool_reviews_select_auth on public.tool_reviews
  for select to authenticated
  using (
    status = 'visible'
    or user_id = (select auth.uid())
    or public.is_moderator()
  );
