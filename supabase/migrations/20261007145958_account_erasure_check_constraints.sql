-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20261007145958. History: never edit.

-- Found 2026-10-07: deleting an account that had used Ask Celpare failed, because
-- ai_usage_records.user_id SET NULL breaks ai_usage_has_subject. The person's usage
-- records are deleted in account_erase_prepare instead.
-- tools_domain_verified_pair would also stop the deletion of an admin who verified
-- a domain; relaxed so the verifier can be gone while the verification stands.
alter table public.tools drop constraint tools_domain_verified_pair,
  add constraint tools_domain_verified_pair check (domain_verified_by is null or domain_verified_at is not null);

create or replace function public.account_erase_prepare(p_user uuid)
returns table (bucket text, path text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
begin
  select lower(u.email) into v_email from auth.users u where u.id = p_user;
  if not found then
    raise exception 'account_erase_prepare: no such user';
  end if;

  delete from public.security_events where user_id = p_user;
  delete from public.feed_feedback where target_id = p_user;
  -- viewer is 'u:<user id>' text with no foreign key; posts.view_count is stored and stays.
  delete from public.post_viewers where viewer = 'u:' || p_user::text;
  -- ai_usage_has_subject forbids a row with neither a user nor an anonymous hash.
  delete from public.ai_usage_records where user_id = p_user;
  if v_email is not null then
    delete from public.waitlist_users where lower(email) = v_email;
    delete from public.waitlist_founders where lower(email) = v_email;
    delete from public.demo_requests where lower(email) = v_email;
  end if;
  update public.tools set owner_email = null where developer_id = p_user;

  update storage.objects o set owner = null, owner_id = null
   where (o.owner = p_user or o.owner_id = p_user::text)
     and o.bucket_id in ('tool-images', 'tool-videos');

  return query
    select o.bucket_id::text, o.name::text from storage.objects o
     where (o.owner = p_user or o.owner_id = p_user::text);
end;
$$;

revoke all on function public.account_erase_prepare(uuid) from public, anon, authenticated;
grant execute on function public.account_erase_prepare(uuid) to service_role;
