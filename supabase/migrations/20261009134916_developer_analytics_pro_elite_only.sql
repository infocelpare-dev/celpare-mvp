-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20261009134916. History: never edit.

-- Developer analytics are for the Pro and Elite developer plans only (founder,
-- 2026-10-09). Enforced here as well as on the page: a Free developer calling
-- the function directly gets no row.
do $$
declare d text;
begin
  d := pg_get_functiondef('public.developer_tool_analytics(integer)'::regprocedure);
  if position('with me as (select auth.uid() as uid),' in d) = 0 then
    raise exception 'developer_tool_analytics: anchor not found';
  end if;
  d := replace(d, 'with me as (select auth.uid() as uid),',
    'with me as (
    -- Pro and Elite developer plans only (founder, 2026-10-09).
    select auth.uid() as uid
    where exists (select 1 from public.developer_profiles dp
                  where dp.id = auth.uid() and dp.plan in (''pro'', ''elite''))
  ),');
  execute d;
end $$;
