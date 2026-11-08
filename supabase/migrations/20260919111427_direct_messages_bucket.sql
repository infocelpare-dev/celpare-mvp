-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260919111427. History: never edit.

/*
  Voice notes and videos sent in a DM.

  THIS BUCKET IS PRIVATE, and that is the whole point of it being separate from
  post-images and post-videos. Those are public by design: the feed is publicly
  readable (D32) and its media has to be too. A voice note sent to one person
  is the opposite. `public = false` means there is no public URL at all, so a
  leaked path is not a leaked recording, and playback goes through a short
  lived signed URL minted per request by the server.

  Audio allows webm and mp4 because MediaRecorder gives different containers on
  different browsers: Chrome records audio/webm with Opus, Safari records
  audio/mp4 with AAC. Accepting only one would silently break half the users.
*/
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'dm-media',
  'dm-media',
  false,
  52428800,
  array[
    'audio/webm','audio/ogg','audio/mp4','audio/mpeg',
    'video/mp4','video/webm'
  ]
)
on conflict (id) do nothing;

/*
  The path is <thread_id>/<sender_id>/<uuid>.<ext>, so the FIRST segment is the
  thread and the second is who sent it.

  Reading is gated on being a participant of that thread, which is the same
  function every dm_ policy uses. Writing additionally requires the second
  segment to be your own id, so a participant cannot upload a file that claims
  to come from the other person.
*/
create policy dm_media_read_participants on storage.objects
  for select to authenticated
  using (
    bucket_id = 'dm-media'
    and public.is_dm_participant(((storage.foldername(name))[1])::uuid)
  );

create policy dm_media_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'dm-media'
    and public.is_dm_participant(((storage.foldername(name))[1])::uuid)
    and (storage.foldername(name))[2] = ((select auth.uid()))::text
  );

create policy dm_media_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'dm-media'
    and (storage.foldername(name))[2] = ((select auth.uid()))::text
  );
