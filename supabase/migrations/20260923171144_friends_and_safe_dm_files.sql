-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260923171144. History: never edit.

-- 4BA. Friends (mutual follows), follow back state, friends only new threads,
-- and TXT/CSV attachments that the server can never execute.

-- 1. Follow state between the CALLER and a list of people. SECURITY DEFINER so a
--    private account's hidden follow list does not hide the one fact the caller
--    is entitled to: whether that person follows THEM. It answers only about
--    edges that touch auth.uid(), so it reveals nothing about third parties.
create or replace function public.my_follow_state(p_ids uuid[])
returns table (id uuid, i_follow boolean, follows_me boolean)
language sql stable security definer set search_path = public, pg_temp
as $$
  select x.id,
         exists (select 1 from public.follows f where f.follower_id = (select auth.uid()) and f.following_id = x.id),
         exists (select 1 from public.follows f where f.follower_id = x.id and f.following_id = (select auth.uid()))
  from unnest(coalesce(p_ids, '{}'::uuid[])) as x(id)
  where (select auth.uid()) is not null
  limit 500;
$$;
revoke execute on function public.my_follow_state(uuid[]) from public, anon;
grant execute on function public.my_follow_state(uuid[]) to authenticated, service_role;

-- 2. The caller's friends: people who follow them AND whom they follow.
create or replace function public.my_friends(p_limit integer default 200)
returns table (id uuid, username text, full_name text, avatar_url text)
language sql stable security definer set search_path = public, pg_temp
as $$
  select p.id, p.username::text, p.full_name, p.avatar_url
  from public.follows a
  join public.follows b on b.follower_id = a.following_id and b.following_id = a.follower_id
  join public.profiles p on p.id = a.following_id
  where a.follower_id = (select auth.uid())
  order by p.username
  limit greatest(1, least(coalesce(p_limit, 200), 500));
$$;
revoke execute on function public.my_friends(integer) from public, anon;
grant execute on function public.my_friends(integer) to authenticated, service_role;

create or replace function public.are_friends(p_a uuid, p_b uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (select 1 from public.follows where follower_id = p_a and following_id = p_b)
     and exists (select 1 from public.follows where follower_id = p_b and following_id = p_a);
$$;
revoke execute on function public.are_friends(uuid, uuid) from public, anon, authenticated;

-- 3. A NEW thread needs friends. An existing thread still opens, so nobody loses
--    a conversation they already have.
create or replace function public.dm_start_thread(p_other uuid)
returns uuid
language plpgsql security definer set search_path = public, pg_temp
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
  if not public.is_active_account() then
    raise exception 'account cannot send messages' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = p_other) then
    raise exception 'no such person' using errcode = '22023';
  end if;

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

  -- Friends only, founder instruction 2026-09-23. Enforced here and not only in
  -- the picker, or anybody could call this RPC with any id and start a thread.
  if not public.are_friends(me, p_other) then
    raise exception 'friends only' using errcode = 'P0003';
  end if;

  insert into public.dm_threads (created_by) values (me) returning id into created;
  insert into public.dm_participants (thread_id, user_id)
  values (created, me), (created, p_other);
  return created;
end;
$$;

-- 4. The files bucket. Private. The storage server itself refuses any other type
--    and anything over 1 MB, before a byte reaches a policy or our code.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dm-files', 'dm-files', false, 1048576, array['text/plain', 'text/csv'])
on conflict (id) do update
  set public = false, file_size_limit = 1048576, allowed_mime_types = array['text/plain', 'text/csv'];

-- Voice notes stay; video uploads end (TXT/CSV are the only attachments now).
update storage.buckets
   set allowed_mime_types = array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg'],
       file_size_limit = 10485760
 where id = 'dm-media';

-- How many files the caller uploaded in the last day. DEFINER, because a policy on
-- storage.objects that counts storage.objects would recurse.
create or replace function public.dm_files_uploaded_today()
returns integer
language sql stable security definer set search_path = public, storage, pg_temp
as $$
  select count(*)::int from storage.objects
  where bucket_id = 'dm-files' and owner = (select auth.uid())
    and created_at > now() - interval '1 day';
$$;
revoke execute on function public.dm_files_uploaded_today() from public, anon;
grant execute on function public.dm_files_uploaded_today() to authenticated;

-- Path is <thread>/<uploader>/<random uuid>.(txt|csv). Nothing the user named.
-- INSERT: a participant, into their own folder, under the path shape, within 30 a day.
-- SELECT: the thread's participants. NO UPDATE and NO DELETE policy: once uploaded a
-- file cannot be replaced, so what was checked at send time is what is served.
create policy dm_files_insert_own on storage.objects for insert to authenticated
  with check (
    bucket_id = 'dm-files'
    and public.is_dm_participant(((storage.foldername(name))[1])::uuid)
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(txt|csv)$'
    and public.dm_files_uploaded_today() < 30
  );
create policy dm_files_read_participants on storage.objects for select to authenticated
  using (
    bucket_id = 'dm-files'
    and public.is_dm_participant(((storage.foldername(name))[1])::uuid)
  );

-- 5. The message shape for a file.
alter table public.dm_messages
  add column if not exists file_name text,
  add column if not exists file_size integer;

alter table public.dm_messages drop constraint dm_messages_kind_ok;
alter table public.dm_messages add constraint dm_messages_kind_ok
  check (kind = any (array['text', 'voice', 'link', 'video', 'file']));

alter table public.dm_messages drop constraint dm_messages_shape_ok;
alter table public.dm_messages add constraint dm_messages_shape_ok check (
  case kind
    when 'text'  then body is not null and link_url is null and media_path is null
    when 'link'  then link_url is not null and media_path is null
    when 'voice' then media_path is not null and link_url is null
    when 'video' then media_path is not null and link_url is null
    when 'file'  then media_path is not null and link_url is null and file_name is not null and file_size is not null
    else false
  end
);

alter table public.dm_messages add constraint dm_messages_file_ok check (
  (file_name is null and file_size is null)
  or (
    kind = 'file'
    and char_length(file_name) between 5 and 120
    and file_name ~ '^[A-Za-z0-9 ._()-]+\.(txt|csv)$'
    and file_size between 1 and 1048576
    and media_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(txt|csv)$'
  )
);

grant insert (file_name, file_size) on public.dm_messages to authenticated;

-- 6. At most 20 file messages a day per sender, counted in the database.
create or replace function public.tg_dm_file_daily_cap()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if new.kind = 'file' and (
    select count(*) from public.dm_messages
    where sender_id = new.sender_id and kind = 'file'
      and created_at > now() - interval '1 day'
  ) >= 20 then
    raise exception 'file_daily_limit' using errcode = 'P0004';
  end if;
  return new;
end;
$$;
revoke execute on function public.tg_dm_file_daily_cap() from public, anon, authenticated;

create trigger dm_messages_file_daily_cap
  before insert on public.dm_messages
  for each row when (new.kind = 'file')
  execute function public.tg_dm_file_daily_cap();
