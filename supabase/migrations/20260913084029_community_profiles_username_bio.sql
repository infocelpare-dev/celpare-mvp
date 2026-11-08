-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260913084029. History: never edit.

-- Task 4.2. Spec: docs/context/10-community.md section 6.
-- Adds the identity a post needs (username, bio) and closes two holes in the
-- existing profiles policies that community RLS would otherwise inherit.

alter table public.profiles
  add column if not exists username extensions.citext,
  add column if not exists bio text;

alter table public.profiles
  drop constraint if exists profiles_bio_len;
alter table public.profiles
  add constraint profiles_bio_len
  check (bio is null or char_length(bio) <= 280);

alter table public.profiles
  drop constraint if exists profiles_username_format;
alter table public.profiles
  add constraint profiles_username_format
  check (username is null or username operator(extensions.~) '^[a-z0-9_]{3,30}$'::extensions.citext);

-- Username generation. Lowercase the email local part, strip anything that is not
-- a-z 0-9 or underscore, then add a numeric suffix until it is free.
create or replace function public.generate_username(seed text)
returns extensions.citext
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  base text;
  candidate extensions.citext;
  n integer := 0;
begin
  base := lower(regexp_replace(coalesce(seed, ''), '[^a-zA-Z0-9_]', '', 'g'));
  if char_length(base) < 3 then
    -- never pad into an accidental word, so prefix rather than suffix
    base := 'celpare' || base;
  end if;
  base := left(base, 24);
  candidate := base::extensions.citext;
  while exists (select 1 from public.profiles p where p.username = candidate) loop
    n := n + 1;
    candidate := (base || n::text)::extensions.citext;
  end loop;
  return candidate;
end;
$function$;

-- Not callable over REST. Same fix task 3.1 needed for the trigger functions.
revoke all on function public.generate_username(text) from public, anon, authenticated;

update public.profiles
set username = public.generate_username(split_part(email, '@', 1))
where username is null;

alter table public.profiles alter column username set not null;

create unique index if not exists profiles_username_key on public.profiles (username);

-- Signup now mints a username too.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.profiles (id, email, full_name, avatar_url, username)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url',
    public.generate_username(split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$function$;

-- Defect 1: profiles_select was authenticated with qual true, so any signed in
-- user could read every user's email address. Community needs anon to read the
-- author of a post, so the fix is column privileges rather than a narrower row
-- policy: RLS decides which rows, GRANT decides which columns.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select_public on public.profiles
  for select to anon, authenticated using (true);

revoke select on public.profiles from anon, authenticated;
grant select (id, username, full_name, avatar_url, bio, is_developer, role, created_at)
  on public.profiles to anon, authenticated;

-- Defect 2: profiles_update_own allowed the owner to write any column, including
-- role. A user could set their own role to super_admin and become a moderator of
-- the community that is about to be built. Column grants close it.
revoke update on public.profiles from anon, authenticated;
grant update (username, full_name, avatar_url, bio, is_developer, onboarded_at)
  on public.profiles to authenticated;
