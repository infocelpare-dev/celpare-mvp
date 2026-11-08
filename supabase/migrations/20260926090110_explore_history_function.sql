-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260926090110. History: never edit.

-- 4BI. The caller's own Explore history. No id argument: it answers only for auth.uid().
create or replace function public.my_explore_history(p_days integer default 30)
returns table(entity_type text, entity_id uuid, entity_key text, event text, section text, at timestamptz)
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select r.entity_type, r.entity_id, r.entity_key, r.event, r.section, r.created_at
    from public.recommendation_events r
   where r.user_id = (select auth.uid())
     and (select auth.uid()) is not null
     and r.entity_type is not null
     and r.created_at > now() - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 90))
   order by r.created_at desc
   limit 1000;
$$;

revoke all on function public.my_explore_history(integer) from public, anon;
grant execute on function public.my_explore_history(integer) to authenticated;
