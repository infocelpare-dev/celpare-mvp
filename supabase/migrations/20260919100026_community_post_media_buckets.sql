-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260919100026. History: never edit.

-- Two buckets, mirroring the tool media pair 4X created: same caps, same MIME
-- allowlists, same per user folder rule. Separate from tool-images and
-- tool-videos on purpose, so a retention or moderation decision about what
-- people post never has to be untangled from a developer's product shots.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('post-images', 'post-images', true,  5242880,  array['image/png','image/jpeg','image/webp']),
  ('post-videos', 'post-videos', true, 52428800, array['video/mp4','video/webm'])
on conflict (id) do nothing;

-- The first path segment must be the caller's own user id, so nobody writes
-- into somebody else's folder. Identical in shape to tool_media_insert_own.
create policy post_media_insert_own_obj on storage.objects
  for insert to authenticated
  with check (
    bucket_id = any (array['post-images','post-videos'])
    and (storage.foldername(name))[1] = ((select auth.uid()))::text
  );

create policy post_media_update_own_obj on storage.objects
  for update to authenticated
  using (
    bucket_id = any (array['post-images','post-videos'])
    and (storage.foldername(name))[1] = ((select auth.uid()))::text
  )
  with check (
    bucket_id = any (array['post-images','post-videos'])
    and (storage.foldername(name))[1] = ((select auth.uid()))::text
  );

create policy post_media_delete_own_obj on storage.objects
  for delete to authenticated
  using (
    bucket_id = any (array['post-images','post-videos'])
    and (storage.foldername(name))[1] = ((select auth.uid()))::text
  );

-- The feed is publicly readable (D32), so its media has to be too.
create policy post_media_read_all_obj on storage.objects
  for select to anon, authenticated
  using (bucket_id = any (array['post-images','post-videos']));
