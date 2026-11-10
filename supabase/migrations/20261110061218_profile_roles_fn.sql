-- SEC.7 finding 1, expand step. profiles.role was readable by anon, so
-- profiles?role=neq.user named the super_admin account to anyone. The app now
-- reads roles through this function; a later migration revokes the column.
--
-- Your own role always. Other people's roles only when the caller is active
-- staff, which is what the admin pages need for author badges. Capped at 200
-- ids per call, like profile_written_fields.

create or replace function public.profile_roles(p_ids uuid[])
returns table (id uuid, role text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.role
  from public.profiles p
  where p.id = any(p_ids[1:200])
    and (
      p.id = (select auth.uid())
      or exists (
        select 1 from public.profiles me
        where me.id = (select auth.uid())
          and me.role <> 'user'
          and public.is_active_account()
      )
    );
$$;

-- Revoke before grant (D250): new functions get EXECUTE through PUBLIC.
revoke execute on function public.profile_roles(uuid[]) from public, anon;
grant execute on function public.profile_roles(uuid[]) to authenticated;
