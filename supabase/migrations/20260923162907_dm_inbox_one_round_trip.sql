-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260923162907. History: never edit.

-- The inbox in one query (4AZ). listThreads made three rounds in a row and the
-- middle one downloaded every message of every thread to find each thread's
-- latest. This reads the latest per thread through the (thread_id, created_at)
-- index and nothing else.
--
-- SECURITY INVOKER: it runs as the caller, so dm_*_select_own (is_dm_participant)
-- and the profiles policy apply exactly as they did to the three queries it
-- replaces. It starts from the caller's own participant rows, so it cannot be
-- pointed at anybody else's threads.
create or replace function public.dm_inbox(p_limit integer default 100)
returns table (
  thread_id uuid,
  last_message_at timestamptz,
  other_id uuid,
  other_username text,
  other_full_name text,
  other_avatar_url text,
  last_kind text,
  last_body text,
  last_sender_id uuid,
  unread boolean
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    t.id,
    t.last_message_at,
    o.user_id,
    pr.username::text,
    pr.full_name,
    pr.avatar_url,
    lm.kind,
    lm.body,
    lm.sender_id,
    coalesce(
      lm.sender_id is not null
      and lm.sender_id <> me.user_id
      and (me.last_read_at is null or lm.created_at > me.last_read_at),
      false
    )
  from public.dm_participants me
  join public.dm_threads t on t.id = me.thread_id
  left join lateral (
    select p.user_id
    from public.dm_participants p
    where p.thread_id = me.thread_id and p.user_id <> me.user_id
    limit 1
  ) o on true
  left join public.profiles pr on pr.id = o.user_id
  left join lateral (
    select m.kind, m.body, m.sender_id, m.created_at
    from public.dm_messages m
    where m.thread_id = me.thread_id and m.deleted_at is null
    order by m.created_at desc
    limit 1
  ) lm on true
  where me.user_id = (select auth.uid())
  order by t.last_message_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 200));
$$;

revoke execute on function public.dm_inbox(integer) from public, anon;
grant execute on function public.dm_inbox(integer) to authenticated, service_role;
