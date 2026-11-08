-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260919114919. History: never edit.

/*
  A username must not give away an email address.

  THE LEAK, measured rather than suspected: handle_new_user seeded the username
  with split_part(new.email, '@', 1), so an account created from
  ameagmahad@gmail.com got the username `ameagmahad`. Usernames are public by
  design, gmail is the overwhelmingly common domain, and the two together hand
  anybody the address. `profiles.email` itself was never the problem: it is
  granted to postgres and service_role only, and anon and authenticated cannot
  read it at all.

  The seed is now the display name a provider gave us, and nothing at all when
  there is not one. A person can still change their username afterwards, which
  is the real answer; this only stops the DEFAULT being an address.
*/
create or replace function public.generate_username(seed text)
returns citext
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  base      text;
  candidate extensions.citext;
  n         integer := 0;
begin
  base := lower(regexp_replace(coalesce(seed, ''), '[^a-zA-Z0-9_]', '', 'g'));

  if char_length(base) < 3 then
    /*
      No usable seed. RANDOM rather than sequential: the old branch produced
      celpare, then celpare1, celpare2, which quietly encodes signup order and
      tells anybody how many accounts exist. Six hex characters is 16 million,
      and the loop below still settles a collision.
    */
    base := 'celpare' || substr(md5(gen_random_uuid()::text), 1, 6);
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

/*
  The seed is the provider's display name, never the email.

  An email signup with no name gets a random handle, which is the correct
  trade: an unmemorable default a person is invited to change beats a default
  that publishes their address the moment they post.
*/
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
        public.generate_username(
          coalesce(
            new.raw_user_meta_data->>'full_name',
            new.raw_user_meta_data->>'name',
            ''
          )
        )
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
