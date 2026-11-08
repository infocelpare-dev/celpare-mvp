-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20261007135358. History: never edit.

-- Account deletion (phase LEGAL, 2026-10-07). Deleting auth.users cascades to
-- profiles; these links had no delete rule and blocked it.
alter table public.search_events drop constraint search_events_user_id_fkey,
  add constraint search_events_user_id_fkey foreign key (user_id) references public.profiles(id) on delete set null;
alter table public.tool_view_events drop constraint tool_view_events_user_id_fkey,
  add constraint tool_view_events_user_id_fkey foreign key (user_id) references public.profiles(id) on delete set null;
alter table public.model_view_events drop constraint model_view_events_user_id_fkey,
  add constraint model_view_events_user_id_fkey foreign key (user_id) references public.profiles(id) on delete set null;
alter table public.recommendation_events drop constraint recommendation_events_user_id_fkey,
  add constraint recommendation_events_user_id_fkey foreign key (user_id) references public.profiles(id) on delete set null;
alter table public.security_events drop constraint security_events_user_id_fkey,
  add constraint security_events_user_id_fkey foreign key (user_id) references public.profiles(id) on delete set null;
alter table public.moderation_actions drop constraint moderation_actions_target_user_fkey,
  add constraint moderation_actions_target_user_fkey foreign key (target_user) references public.profiles(id) on delete set null;
alter table public.moderation_actions drop constraint moderation_actions_actor_id_fkey,
  add constraint moderation_actions_actor_id_fkey foreign key (actor_id) references public.profiles(id) on delete set null;
alter table public.reports drop constraint reports_assigned_to_fkey,
  add constraint reports_assigned_to_fkey foreign key (assigned_to) references public.profiles(id) on delete set null;
alter table public.platform_settings drop constraint platform_settings_updated_by_fkey,
  add constraint platform_settings_updated_by_fkey foreign key (updated_by) references public.profiles(id) on delete set null;
-- The audit log is append only (tg_audit_append_only), so a cascade update would
-- be refused. The actor id stays as a historical value with no reference.
alter table public.admin_audit_log drop constraint admin_audit_log_actor_id_fkey;

-- Runs before auth.admin.deleteUser. Removes what the cascades cannot reach,
-- releases tool media to the listings that outlive the account, and returns the
-- personal storage objects the server must delete through the Storage API.
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
