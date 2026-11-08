-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260914134839. History: never edit.

-- Founder instruction 2026-09-14: profile picture uploads.
--
-- This REVERSES D71 and partially reverses D42, which deferred user uploads on
-- the grounds that accepting files needs a bucket, a malware scanner, an image
-- moderation path and a retention decision. Three of the four are addressed
-- here in the technical controls below. The two that are NOT are moderation
-- and retention, which are policy rather than code, and they are logged as
-- open gaps rather than quietly assumed away.
--
-- Controls, in order of how much they actually matter:
--   1. The path is scoped to the owner. A person may only write under a folder
--      named with their own auth.uid(), so nobody can overwrite anybody.
--   2. A hard size cap at the bucket, which the client cannot raise.
--   3. A MIME allowlist at the bucket. The server action also checks the real
--      file bytes, because a declared content type is a claim, not a fact.
--   4. Public read. Avatars are rendered on public profiles, so the bucket is
--      public and the URL is stable and cacheable. There is nothing private
--      here that a signed URL would protect.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  2097152, -- 2 MB. A profile picture that needs more than this is a mistake.
  array['image/png', 'image/jpeg', 'image/webp']
);

-- Anyone may read. The bucket is public, so this matches what the CDN serves
-- and keeps the policy honest rather than implying a privacy it does not have.
create policy avatars_read_all on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'avatars');

/*
  Write, replace and delete, all scoped to your own folder.

  storage.foldername(name) splits the object path, so the first segment must
  equal the caller's uid. An object at `<uid>/whatever.png` is yours and
  anything else is not. This is the control that stops one account replacing
  another account's face.
*/
create policy avatars_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy avatars_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Deleting your own picture is a real delete, not a soft one. The "never hard
-- delete" rule in 03-data-model.md protects authored words and a discarded
-- avatar is not that. Leaving orphaned files forever is the worse outcome.
create policy avatars_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
