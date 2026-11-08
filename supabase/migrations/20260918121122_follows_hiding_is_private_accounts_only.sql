-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260918121122. History: never edit.

-- Founder instruction 2026-09-18: a private account may hide its followers and
-- following. A public account may not.
--
-- This inverts what the first version did. There, `show_follows` was one of the
-- section toggles and was switched off with the rest when the account went
-- private, on the reasoning that a private profile still shows its counts. The
-- founder's rule is the other way round: the counts are part of what a PUBLIC
-- profile owes, and hiding them is something you earn by going private.
--
-- So `follows` is now the one section that survives `is_private`, rather than
-- the one that dies with it:
--
--   public   always shared. show_follows is not consulted.
--   private  shared unless show_follows is off.
--
-- Every other section keeps the old rule: nothing is shared while private.

create or replace function public.profile_shares(p_owner uuid, p_section text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when p_owner is null then false
    -- Your own everything, always. Without this branch a private account could
    -- not read its own posts back, and the owner-only tabs would empty out.
    when p_owner = (select auth.uid()) then true
    else coalesce((
      select case
        when p_section = 'follows' then
          -- The exception. A public account cannot hide these.
          case when p.is_private then p.show_follows else true end
        else
          (not p.is_private)
          and case p_section
                when 'posts'   then true
                when 'replies' then p.show_replies
                when 'tools'   then p.show_saved_tools
                when 'models'  then p.show_saved_models
                -- Unknown section fails closed. A privacy check is not a
                -- feature flag, which D80 settled fails open.
                else false
              end
      end
      from public.profiles p
      where p.id = p_owner
    ), false)
  end;
$$;

revoke all on function public.profile_shares(uuid, text) from public;
grant execute on function public.profile_shares(uuid, text) to anon, authenticated;
