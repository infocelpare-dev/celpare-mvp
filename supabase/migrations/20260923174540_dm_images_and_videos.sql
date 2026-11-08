-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260923174540. History: never edit.

-- 4BB. Images and videos as attachments, with limits the storage server enforces.

-- 1. Images: their own private bucket, 5 MB, JPEG PNG WebP only. No SVG (it can
--    carry script) and no GIF (not asked for).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dm-images', 'dm-images', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

-- 2. Voice notes and videos share dm-media, as videos always did: 25 MB, audio,
--    MP4 and WebM. The per kind limit (10 MB voice, 25 MB video) is re-checked at
--    send from the object's real size.
update storage.buckets
   set allowed_mime_types = array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg',
                                  'video/mp4', 'video/webm'],
       file_size_limit = 26214400
 where id = 'dm-media';

-- 3. The daily upload count covers every attachment bucket, 30 a day in total.
create or replace function public.dm_files_uploaded_today()
returns integer
language sql stable security definer set search_path = public, storage, pg_temp
as $$
  select count(*)::int from storage.objects
  where bucket_id in ('dm-files', 'dm-images', 'dm-media')
    and owner = (select auth.uid())
    and created_at > now() - interval '1 day';
$$;

-- 4. dm-media: NO delete policy any more. With one, a file could be removed after
--    it was checked at send and a different one uploaded under the same name. The
--    app never deletes media (retracting a message stamps the row). Insert now
--    also requires the path shape and the daily count.
drop policy if exists dm_media_delete_own on storage.objects;
drop policy if exists dm_media_insert_own on storage.objects;
create policy dm_media_insert_own on storage.objects for insert to authenticated
  with check (
    bucket_id = 'dm-media'
    and public.is_dm_participant(((storage.foldername(name))[1])::uuid)
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(webm|ogg|m4a|mp3|mp4)$'
    and public.dm_files_uploaded_today() < 30
  );

-- dm-images: the dm-files rules, image extensions.
create policy dm_images_insert_own on storage.objects for insert to authenticated
  with check (
    bucket_id = 'dm-images'
    and public.is_dm_participant(((storage.foldername(name))[1])::uuid)
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'
    and public.dm_files_uploaded_today() < 30
  );
create policy dm_images_read_participants on storage.objects for select to authenticated
  using (
    bucket_id = 'dm-images'
    and public.is_dm_participant(((storage.foldername(name))[1])::uuid)
  );

-- 5. The message kind.
alter table public.dm_messages drop constraint dm_messages_kind_ok;
alter table public.dm_messages add constraint dm_messages_kind_ok
  check (kind = any (array['text', 'voice', 'link', 'video', 'file', 'image']));

alter table public.dm_messages drop constraint dm_messages_shape_ok;
alter table public.dm_messages add constraint dm_messages_shape_ok check (
  case kind
    when 'text'  then body is not null and link_url is null and media_path is null
    when 'link'  then link_url is not null and media_path is null
    when 'voice' then media_path is not null and link_url is null
    when 'video' then media_path is not null and link_url is null
    when 'image' then media_path is not null and link_url is null
                      and media_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'
    when 'file'  then media_path is not null and link_url is null and file_name is not null and file_size is not null
    else false
  end
);

-- 6. The daily cap counts every attachment message, not only files.
create or replace function public.tg_dm_file_daily_cap()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if new.kind in ('file', 'image', 'video') and (
    select count(*) from public.dm_messages
    where sender_id = new.sender_id and kind in ('file', 'image', 'video')
      and created_at > now() - interval '1 day'
  ) >= 20 then
    raise exception 'file_daily_limit' using errcode = 'P0004';
  end if;
  return new;
end;
$$;

drop trigger if exists dm_messages_file_daily_cap on public.dm_messages;
create trigger dm_messages_file_daily_cap
  before insert on public.dm_messages
  for each row when (new.kind in ('file', 'image', 'video'))
  execute function public.tg_dm_file_daily_cap();
