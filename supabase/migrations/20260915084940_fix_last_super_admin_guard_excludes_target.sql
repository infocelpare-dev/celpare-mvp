-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260915084940. History: never edit.

-- The last super admin guard counted active super admins INCLUDING the target,
-- which refuses a case it should allow.
--
-- Found by testing: suspend a compromised super admin, then try to demote them.
-- The target is not active, so they are not in the count, and if the caller is
-- the only other super admin the count is 1 and the demotion is refused with
-- "last_super_admin". Demoting a suspended account cannot leave the platform
-- without a super admin, because that account was already unable to act: a
-- suspended staff account holds no capability at all.
--
-- The guard should ask the question it is actually for: after this change, is
-- there still somebody who can promote people? So it counts active super admins
-- other than the target.
--
-- Note for whoever reads this next: with that correction the branch is
-- unreachable through the ordinary flow, and that is fine. The caller is always
-- an active super admin, and cannot_change_own_role means they can never be the
-- target, so the count is always at least one. It stays as a floor under a
-- future change, not as a check that fires today. There is no path that can
-- leave the platform with no super admin: they cannot suspend themselves, and
-- admin_assert_outranks refuses equal rank, so nobody else can suspend them
-- either.
create or replace function public.admin_set_user_role(
  p_user_id uuid,
  p_role    text,
  p_reason  text default null
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_before text; v_name text; v_others integer;
begin
  perform public.admin_require('users.role');

  if p_role not in ('user', 'support', 'moderator', 'dev_ops', 'ai_ops', 'admin', 'super_admin') then
    raise exception 'invalid_role:%', p_role using errcode = '22023';
  end if;
  if p_user_id = (select auth.uid()) then
    raise exception 'cannot_change_own_role' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  select role, username into v_before, v_name from public.profiles where id = p_user_id;
  if v_before is null then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;

  if v_before = 'super_admin' and p_role <> 'super_admin' then
    select count(*) into v_others from public.profiles
     where role = 'super_admin' and account_status = 'active' and id <> p_user_id;
    if v_others = 0 then
      raise exception 'last_super_admin' using errcode = '42501';
    end if;
  end if;

  update public.profiles set role = p_role, updated_at = now() where id = p_user_id;

  perform public.admin_audit(
    'user.role_changed', 'user', p_user_id::text, v_name::text, p_reason,
    jsonb_build_object('role', v_before), jsonb_build_object('role', p_role));
end;
$$;

revoke execute on function public.admin_set_user_role(uuid, text, text) from public;
grant execute on function public.admin_set_user_role(uuid, text, text) to authenticated;
