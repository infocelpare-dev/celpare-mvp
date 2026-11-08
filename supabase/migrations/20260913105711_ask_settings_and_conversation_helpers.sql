-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260913105711. History: never edit.

-- Ask Celpare settings, per person.
-- jsonb rather than columns: these are preferences that will change shape while
-- the assistant is young, and a migration per toggle is not worth it. Anything
-- that gates access or spend stays a real column (plan, role), because those
-- must be constrained by the database and not by whatever the client sent.
alter table public.profiles
  add column if not exists ask_settings jsonb not null default '{}'::jsonb;

-- In the user's update grant: these are their preferences to change.
grant update (ask_settings) on public.profiles to authenticated;
grant select (ask_settings) on public.profiles to anon, authenticated;

-- Guard rails, so a hand crafted REST call cannot store something absurd that
-- the reader then has to defend against on every request.
alter table public.profiles drop constraint if exists profiles_ask_settings_shape;
alter table public.profiles
  add constraint profiles_ask_settings_shape check (
    jsonb_typeof(ask_settings) = 'object'
    and (not ask_settings ? 'answerLength'
         or ask_settings->>'answerLength' in ('short','balanced','detailed'))
    and (not ask_settings ? 'webSearch'
         or jsonb_typeof(ask_settings->'webSearch') = 'boolean')
    and (not ask_settings ? 'saveHistory'
         or jsonb_typeof(ask_settings->'saveHistory') = 'boolean')
    and pg_column_size(ask_settings) < 2000
  );

-- Title a conversation from its first message. Done in the database so the
-- title is written in the same transaction as the message, rather than needing
-- a second model call purely to name a chat.
create or replace function public.title_from_message(body text)
returns text
language sql
immutable
set search_path to 'public'
as $function$
  select case
    when body is null or btrim(body) = '' then 'New chat'
    when char_length(btrim(body)) <= 60 then btrim(body)
    else left(btrim(body), 57) || '...'
  end;
$function$;

grant execute on function public.title_from_message(text) to authenticated;
