-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260919111324. History: never edit.

/*
  Find or create the one to one thread between the caller and somebody else.

  WHY AN RPC RATHER THAN TWO CLIENT INSERTS. Creating a thread means writing a
  dm_threads row and TWO dm_participants rows, and the second participant is
  not the caller, so no sane insert policy on dm_participants could allow it:
  a policy permissive enough to add somebody else to a thread is a policy that
  lets anybody add themselves to yours. There is no dm_participants insert
  policy or grant at all, deliberately. This function is the only way in, it is
  SECURITY DEFINER, and it can do exactly one thing.

  It is also the only place that knows a thread is one to one. The tables do
  not assume it, so a group thread later is rows rather than a migration.

  WHO MAY MESSAGE WHOM IS NOT RESTRICTED HERE, and that is a recorded gap
  rather than an oversight. Any active account can open a thread with any
  other. There is no block list, no mute and no message request inbox in this
  schema, so there is nothing to consult. At two accounts that is not a live
  problem; before this is public it is, and the fix is a blocks table plus a
  request state on dm_participants, which is additive.
*/
create or replace function public.dm_start_thread(p_other uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  me      uuid := (select auth.uid());
  found   uuid;
  created uuid;
begin
  if me is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;

  if p_other is null or p_other = me then
    raise exception 'pick somebody else' using errcode = '22023';
  end if;

  -- The caller must be allowed to act at all. Mirrors every write policy on
  -- the community tables, so a suspended account cannot open a thread either.
  if not public.is_active_account() then
    raise exception 'account cannot send messages' using errcode = '42501';
  end if;

  -- The other party has to exist. No check on THEIR status: suspending
  -- somebody should not delete the ability to see a conversation you already
  -- had with them, and dm_messages_insert_own stops them replying.
  if not exists (select 1 from public.profiles where id = p_other) then
    raise exception 'no such person' using errcode = '22023';
  end if;

  -- An existing thread whose participants are EXACTLY these two. The having
  -- clause is what makes it exact: without the count a future group thread
  -- containing both of us would match.
  select t.id into found
  from public.dm_threads t
  join public.dm_participants p on p.thread_id = t.id
  group by t.id
  having count(*) = 2
     and bool_or(p.user_id = me)
     and bool_or(p.user_id = p_other)
  limit 1;

  if found is not null then
    return found;
  end if;

  insert into public.dm_threads (created_by) values (me) returning id into created;
  insert into public.dm_participants (thread_id, user_id)
  values (created, me), (created, p_other);

  return created;
end;
$$;

revoke all on function public.dm_start_thread(uuid) from anon, public;
grant execute on function public.dm_start_thread(uuid) to authenticated;
