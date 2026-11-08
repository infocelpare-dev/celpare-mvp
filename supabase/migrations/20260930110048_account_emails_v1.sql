-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260930110048. History: never edit.

-- D191: the New follower email switch. Default on; the in-app switches are unchanged.
alter table public.notification_preferences
  add column if not exists email_follows boolean not null default true;

create or replace function public.my_notification_preferences()
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select coalesce((select to_jsonb(p) - 'user_id' - 'updated_at' from public.notification_preferences p where p.user_id = auth.uid()),
    '{"likes": true, "comments": true, "replies": true, "reposts": true, "follows": true, "mentions": true, "performance": true, "email_follows": true}'::jsonb);
$function$;

create or replace function public.set_notification_preference(p_key text, p_on boolean)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if p_key not in ('likes', 'comments', 'replies', 'reposts', 'follows', 'mentions', 'performance', 'email_follows') then
    raise exception 'unknown_preference' using errcode = '22023';
  end if;
  insert into public.notification_preferences (user_id) values (auth.uid()) on conflict do nothing;
  execute format('update public.notification_preferences set %I = $1, updated_at = now() where user_id = $2', p_key)
    using p_on, auth.uid();
end $function$;

-- D192: browsers a person has logged in from, for the New login detected email.
-- Server only: written and read with the service role after a completed login.
create table if not exists public.known_devices (
  user_id uuid not null references public.profiles(id) on delete cascade,
  device_id uuid not null,
  user_agent text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (user_id, device_id)
);
alter table public.known_devices enable row level security;
revoke all on public.known_devices from anon, authenticated;
