-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260918105222. History: never edit.

-- Somebody else's saved tools and models, when they have chosen to show them.
--
-- WHY A FUNCTION AND NOT A POLICY. user_saved_tools.note is in the SELECT
-- column grant, and a note is a private annotation: "too expensive", "ask
-- legal", "the one that broke the build". Widening the row policy to let a
-- visitor read a shared list would hand them the notes with it, because a
-- column grant is role wide and cannot be narrowed per row. Somebody switching
-- on "show my saved tools" is publishing a list of tools, not their diary.
--
-- So these return the tool and nothing else. There is no parameter for the
-- note and no branch that could add one. It also means anon still holds no
-- grant on either table at all, which is the stronger position.
--
-- profile_shares is the single control, the same function the policies use, so
-- a private account is refused here without this file repeating the rule.

create or replace function public.public_saved_tools(p_owner uuid, p_limit int default 20)
returns table (
  id       uuid,
  slug     text,
  name     text,
  tagline  text,
  logo_url text,
  pricing  text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select t.id, t.slug, t.name, t.tagline, t.logo_url, t.pricing
  from public.user_saved_tools s
  join public.tools t on t.id = s.tool_id
  where public.profile_shares(p_owner, 'tools')
    and s.user_id = p_owner
    and t.status = 'approved'
  order by s.created_at desc
  limit greatest(1, least(coalesce(p_limit, 20), 50));
$$;

revoke all on function public.public_saved_tools(uuid, int) from public;
grant execute on function public.public_saved_tools(uuid, int) to anon, authenticated;

create or replace function public.public_saved_models(p_owner uuid, p_limit int default 20)
returns table (
  id          uuid,
  slug        text,
  name        text,
  provider    text,
  description text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m.id, m.slug, m.name, m.provider, m.description
  from public.user_saved_models s
  join public.models m on m.id = s.model_id
  where public.profile_shares(p_owner, 'models')
    and s.user_id = p_owner
  order by s.created_at desc
  limit greatest(1, least(coalesce(p_limit, 20), 50));
$$;

revoke all on function public.public_saved_models(uuid, int) from public;
grant execute on function public.public_saved_models(uuid, int) to anon, authenticated;
