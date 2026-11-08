-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260923145738. History: never edit.

-- Public buckets serve files by URL without consulting RLS. A SELECT policy open to
-- everybody only adds the list API, which let anyone enumerate every uploaded file,
-- including media from drafts and deleted posts. Each owner keeps SELECT on their
-- own folder, because storage needs it to remove or replace an object.
drop policy if exists avatars_read_all on storage.objects;
drop policy if exists post_media_read_all_obj on storage.objects;
drop policy if exists tool_media_read_all on storage.objects;

create policy avatars_read_own on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy post_media_read_own_obj on storage.objects for select to authenticated
  using (bucket_id = any (array['post-images','post-videos']) and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy tool_media_read_own on storage.objects for select to authenticated
  using (bucket_id = any (array['tool-images','tool-videos']) and (storage.foldername(name))[1] = (select auth.uid())::text);
