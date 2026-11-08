-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260914075853. History: never edit.

-- Task 4.2 completion. Two defects in community_profiles_username_bio.
--
-- 1. The format CHECK did not enforce lowercase. citext makes the regex
--    operator case insensitive, so 'ABCdef' ~ '^[a-z0-9_]{3,30}$' is true on a
--    citext column. Usernames go into /u/[username], and the spec says they are
--    lowercase. Casting to text restores a case sensitive match.
--
-- 2. generate_username picks a free suffix with a SELECT, then the INSERT takes
--    the unique index. Two signups sharing an email local part in the same
--    instant both read the same free name, and the loser's INSERT raises inside
--    the auth trigger, which rolls back the auth.users row. A failed signup is
--    not an acceptable outcome for a name collision, so the trigger now retries.

alter table public.profiles drop constraint if exists profiles_username_format;

alter table public.profiles add constraint profiles_username_format
  check (username is null or username::text ~ '^[a-z0-9_]{3,30}$');

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  attempt integer := 0;
begin
  loop
    attempt := attempt + 1;
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
    exception when unique_violation then
      -- id conflicts are swallowed above, so this is the username index. The
      -- competing row is committed by the time we get here, which means the
      -- next generate_username call can see it and pick the next suffix.
      if attempt >= 5 then
        raise;
      end if;
    end;
  end loop;
end;
$function$;
