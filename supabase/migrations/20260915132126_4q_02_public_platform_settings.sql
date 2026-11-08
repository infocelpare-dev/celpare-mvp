-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260915132126. History: never edit.

-- Phase 4Q.3. platform_settings stops being write only.
--
-- Nine keys existed and nothing outside the admin dashboard read any of them:
-- the feature flags flagged nothing, the announcement announced nothing, and
-- the featured tool and model lists were featured nowhere. An administrator
-- could toggle public signup off and accounts would keep being created.
--
-- The table stays staff readable. A marked subset is exposed through one
-- SECURITY DEFINER function instead, because the product needs these before a
-- session exists (the signup flag is read on the signup page by an anonymous
-- visitor) and because not every setting belongs in public view: the moderation
-- thresholds are the auto hide's tuning and stay private.

alter table public.platform_settings
  add column if not exists is_public boolean not null default false;

comment on column public.platform_settings.is_public is
  'Readable by anyone through public_platform_settings(). Off by default, so a new key is private until somebody decides otherwise.';

update public.platform_settings
   set is_public = true
 where category in ('announcements', 'content', 'features');

create or replace function public.public_platform_settings()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  -- Returns only the marked rows, as one document rather than a row set, so a
  -- caller cannot ask for a key that was not meant for them.
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
  from public.platform_settings
  where is_public;
$$;

revoke all on function public.public_platform_settings() from public, anon, authenticated;
grant execute on function public.public_platform_settings() to anon, authenticated;
