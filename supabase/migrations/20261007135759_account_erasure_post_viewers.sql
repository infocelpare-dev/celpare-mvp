-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20261007135759. History: never edit.

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
