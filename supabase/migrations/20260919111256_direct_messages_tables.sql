-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260919111256. History: never edit.

-- Direct messages. Text, a link, a voice note or a video.
--
-- EVERYTHING IS PREFIXED dm_ AND THAT IS NOT DECORATION. `messages` already
-- exists in this schema and holds Ask Celpare chat turns. A table called
-- `messages` for DMs would collide with it and, worse, would read correctly in
-- a query written a month from now while returning somebody's AI conversation.
--
-- D28 put messaging outside community v1 as a separate subsystem. It still is
-- one: its own tables, its own bucket, its own policies. Nothing here touches
-- posts, comments or the feed.

create table public.dm_threads (
  id              uuid primary key default gen_random_uuid(),
  created_by      uuid not null references public.profiles(id) on delete cascade,
  created_at      timestamptz not null default now(),
  -- Denormalised so the thread list can order without touching dm_messages.
  last_message_at timestamptz not null default now()
);

create table public.dm_participants (
  thread_id    uuid not null references public.dm_threads(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  -- Null means never opened. Drives the unread mark and nothing else.
  last_read_at timestamptz,
  created_at   timestamptz not null default now(),
  primary key (thread_id, user_id)
);

create index dm_participants_user_idx on public.dm_participants (user_id);

create table public.dm_messages (
  id               uuid primary key default gen_random_uuid(),
  thread_id        uuid not null references public.dm_threads(id) on delete cascade,
  sender_id        uuid not null references public.profiles(id) on delete cascade,
  kind             text not null,
  -- text: the message. link: an optional caption. voice/video: unused.
  body             text,
  link_url         text,
  -- The storage PATH, never a URL. The bucket is private, so what a reader
  -- gets is a short lived signed URL minted per request. Storing a public URL
  -- here would be storing something that does not exist.
  media_path       text,
  duration_seconds integer,
  created_at       timestamptz not null default now(),
  deleted_at       timestamptz,

  constraint dm_messages_kind_ok check (kind in ('text','voice','link','video')),
  constraint dm_messages_body_len check (body is null or char_length(body) between 1 and 4000),
  constraint dm_messages_link_ok check (
    link_url is null or (char_length(link_url) <= 2048 and link_url ~ '^https?://[^[:space:]]+$')
  ),
  constraint dm_messages_duration_ok check (
    duration_seconds is null or duration_seconds between 1 and 600
  ),
  -- Each kind must carry what it claims to be, the same rule
  -- posts_kind_matches_attachment enforces on the feed.
  constraint dm_messages_shape_ok check (
    case kind
      when 'text'  then body is not null and link_url is null and media_path is null
      when 'link'  then link_url is not null and media_path is null
      when 'voice' then media_path is not null and link_url is null
      when 'video' then media_path is not null and link_url is null
      else false
    end
  )
);

create index dm_messages_thread_idx on public.dm_messages (thread_id, created_at);

-- REVOKE BEFORE GRANT, on every one of them. pg_default_acl still hands anon
-- and authenticated everything on a new table in public (G41), so this is done
-- by hand every time. A DM table granted to anon would be the worst instance
-- of that bug this project could ship.
revoke all on public.dm_threads      from anon, authenticated, public;
revoke all on public.dm_participants from anon, authenticated, public;
revoke all on public.dm_messages     from anon, authenticated, public;

-- anon gets NOTHING on any of these. Not a narrowed grant: none.
grant select (id, created_by, created_at, last_message_at) on public.dm_threads to authenticated;
grant select (thread_id, user_id, last_read_at, created_at) on public.dm_participants to authenticated;
grant update (last_read_at) on public.dm_participants to authenticated;
grant select (id, thread_id, sender_id, kind, body, link_url, media_path, duration_seconds, created_at, deleted_at)
  on public.dm_messages to authenticated;
grant insert (thread_id, sender_id, kind, body, link_url, media_path, duration_seconds)
  on public.dm_messages to authenticated;
grant update (deleted_at) on public.dm_messages to authenticated;

alter table public.dm_threads      enable row level security;
alter table public.dm_participants enable row level security;
alter table public.dm_messages     enable row level security;

/*
  The one function every policy below calls.

  IT HAS TO BE SECURITY DEFINER, and the reason is recursion rather than
  convenience. "May I read this thread" means "am I a row in dm_participants
  for it", and dm_participants has its own select policy, which would have to
  ask the same question. Postgres detects that as infinite recursion and fails
  the query at 42P17. A definer function reads the table with RLS bypassed
  inside its own body, which breaks the cycle.

  It answers only for auth.uid() and takes no user parameter, the same shape as
  is_active_account(), so it cannot be used to probe who else is in a thread.
*/
create or replace function public.is_dm_participant(p_thread uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select exists (
    select 1 from public.dm_participants p
    where p.thread_id = p_thread
      and p.user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_dm_participant(uuid) from anon, public;
grant execute on function public.is_dm_participant(uuid) to authenticated;

create policy dm_threads_select_own on public.dm_threads
  for select to authenticated
  using (public.is_dm_participant(id));

create policy dm_participants_select_own on public.dm_participants
  for select to authenticated
  using (public.is_dm_participant(thread_id));

-- Only your own row, and only the read marker. Nobody edits anybody else's.
create policy dm_participants_update_own on public.dm_participants
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy dm_messages_select_own on public.dm_messages
  for select to authenticated
  using (public.is_dm_participant(thread_id));

create policy dm_messages_insert_own on public.dm_messages
  for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and public.is_active_account()
    and public.is_dm_participant(thread_id)
  );

-- Retracting your own message. Never a hard delete, per 03-data-model.md, and
-- there is no DELETE policy or grant to make one possible.
create policy dm_messages_update_own on public.dm_messages
  for update to authenticated
  using (sender_id = (select auth.uid()) and deleted_at is null)
  with check (sender_id = (select auth.uid()));

/* Keeps dm_threads.last_message_at true so the thread list orders correctly
   without a subquery per row. */
create or replace function public.tg_dm_touch_thread()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update public.dm_threads
     set last_message_at = new.created_at
   where id = new.thread_id;
  return new;
end;
$$;

revoke all on function public.tg_dm_touch_thread() from anon, authenticated, public;

create trigger dm_messages_touch_thread
  after insert on public.dm_messages
  for each row execute function public.tg_dm_touch_thread();
