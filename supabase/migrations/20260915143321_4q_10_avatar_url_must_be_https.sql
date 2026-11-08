-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260915143321. History: never edit.

-- CodeQL alert #1, "DOM text reinterpreted as HTML", on the avatar img src.
--
-- profiles.avatar_url is in the client UPDATE grant, which is correct: a person
-- owns their picture. What was missing is any rule about what may go in it.
-- Our upload action writes a Supabase storage URL and OAuth writes a provider
-- URL, but neither is the only way in: a direct PostgREST update could store
-- any string at all, and that string is rendered into <img src> on a public
-- profile that every visitor loads.
--
-- The realistic harm is not script execution. Browsers do not run javascript:
-- in an img src. It is that an arbitrary URL makes every viewer's browser call
-- a host the profile owner chose, which is an IP and user agent log they should
-- not be able to collect, and it is a data: URI of arbitrary size.
--
-- https only, and a length bound. This is the control; the render side check
-- added alongside it is the courtesy, in that order and not the other way
-- round.

alter table public.profiles
  drop constraint if exists profiles_avatar_url_ok;

alter table public.profiles
  add constraint profiles_avatar_url_ok
  check (
    avatar_url is null
    or (
      avatar_url ~ '^https://[A-Za-z0-9][A-Za-z0-9.-]*\.[A-Za-z]{2,}(:[0-9]{1,5})?/'
      and length(avatar_url) <= 2048
    )
  );

comment on constraint profiles_avatar_url_ok on public.profiles is
  'https URL with a real host, or nothing. Blocks javascript:, data:, plain http and free text, none of which belong in an img src rendered to every visitor of a public profile.';
