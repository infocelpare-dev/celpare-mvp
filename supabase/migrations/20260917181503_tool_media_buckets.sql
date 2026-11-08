-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260917181503. History: never edit.

-- Founder instruction 2026-09-17: the logo, the cover, screenshots and videos
-- are uploads, not links. This is the second reversal of D42's deferral, after
-- avatars in 4L.4, and it carries the same controls that reversal established.
--
-- TWO buckets rather than one, because the limits are the point. A single
-- bucket takes one file_size_limit, so a 50 MB ceiling for video would also be
-- the ceiling for a logo. Split, each bucket enforces its own size and its own
-- type allowlist, and it holds for a direct API call rather than only for our
-- upload form.
--
-- SVG is deliberately absent from the image list. It is a document that
-- executes, not a picture. GIF is absent too: an animated cover is a decision
-- nobody has made.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('tool-images', 'tool-images', true, 5242880,
   array['image/png', 'image/jpeg', 'image/webp']),
  ('tool-videos', 'tool-videos', true, 52428800,
   array['video/mp4', 'video/webm'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Ownership is the first path segment, exactly as avatars does it, so one
-- account cannot write into another's folder.
--
-- Note what these policies do NOT try to express: whether the file belongs to a
-- tool. It cannot be said here, because the upload happens before the tool row
-- exists. The tool side of that is enforced where it can be: submitTool refuses
-- any media URL that is not in one of these buckets under the caller's own
-- folder, so a URL pointing at somebody else's upload, or at an arbitrary host,
-- never reaches tool_media.

drop policy if exists tool_media_read_all on storage.objects;
create policy tool_media_read_all on storage.objects
  for select to anon, authenticated
  using (bucket_id in ('tool-images', 'tool-videos'));

drop policy if exists tool_media_insert_own on storage.objects;
create policy tool_media_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('tool-images', 'tool-videos')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists tool_media_update_own on storage.objects;
create policy tool_media_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id in ('tool-images', 'tool-videos')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id in ('tool-images', 'tool-videos')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists tool_media_delete_own on storage.objects;
create policy tool_media_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('tool-images', 'tool-videos')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
