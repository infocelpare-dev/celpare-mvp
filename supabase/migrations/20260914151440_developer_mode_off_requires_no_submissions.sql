-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260914151440. History: never edit.

-- Founder instruction 2026-09-14: you cannot turn Developer Mode off once you
-- have submitted tools or models. With nothing submitted, you can.
--
-- In the database rather than only in the action, because is_developer IS in
-- the authenticated UPDATE grant (D20 makes it a self service flag), so a
-- direct PostgREST call can set it without going near our code. A rule that
-- only lives in a server action is a suggestion.
--
-- Note this guards the PREFERENCE, not a permission. Developer authorization
-- is still developer_profiles.accepted_terms_at, and turning the interface off
-- was never what stopped somebody submitting.

create or replace function public.tg_developer_mode_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  -- Only the off transition is restricted. Turning it on is always allowed.
  if old.is_developer and not new.is_developer then
    select
      (select count(*) from public.tools  where developer_id = new.id)
    + (select count(*) from public.models where developer_id = new.id)
    into n;

    if n > 0 then
      raise exception 'developer_mode_locked:%', n using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.tg_developer_mode_guard() from public, anon, authenticated;

create trigger profiles_developer_mode_guard
  before update of is_developer on public.profiles
  for each row execute function public.tg_developer_mode_guard();

-- A cheap read so the UI can explain itself rather than only discovering the
-- rule by being refused. Counting your own rows, so no privilege is needed
-- beyond what the caller already has.
create or replace function public.my_submission_count()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select (
    (select count(*) from public.tools  where developer_id = (select auth.uid()))
  + (select count(*) from public.models where developer_id = (select auth.uid()))
  )::integer;
$$;

revoke all on function public.my_submission_count() from public, anon, authenticated;
grant execute on function public.my_submission_count() to authenticated;
