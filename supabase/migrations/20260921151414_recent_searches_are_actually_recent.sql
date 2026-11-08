-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260921151414. History: never edit.

-- "Recent" was alphabetical, and the browser is what showed it.
--
-- DISTINCT ON forces the ORDER BY to start with the distinct key, so the query
-- was ordered by `normalized` and the LIMIT then took the first ten BY NAME. With
-- eleven searches seeded the list read "ai video generator, best ai for writing,
-- chatgpt alternatives, claude, coding assistant" and so on, which is a perfectly
-- ordered list of the wrong ten. Nothing about it looks wrong until there are
-- more rows than the limit, which is why it survived the SQL checks.
--
-- The dedupe and the ordering are two different jobs, so they are two levels now:
-- the inner query picks one row per distinct search, the outer one puts those in
-- the order somebody actually means by recent. my_recent_activity already had
-- this shape, which is why it was right.
create or replace function public.my_recent_searches(p_limit integer default 10)
returns table (query text, normalized text, searched_at timestamptz, result_count integer)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select d.query, d.normalized, d.created_at, d.result_count
  from (
    -- One row per distinct search, the most recent time it was run. Retyping the
    -- same words four times is one thing worth listing.
    select distinct on (s.normalized)
      s.query, s.normalized, s.created_at, s.result_count
    from public.search_events s
    where s.user_id = (select auth.uid())
      and (select auth.uid()) is not null
    order by s.normalized, s.created_at desc
  ) d
  order by d.created_at desc
  limit greatest(1, least(coalesce(p_limit, 10), 30));
$$;

revoke all on function public.my_recent_searches(integer) from public, anon;
grant execute on function public.my_recent_searches(integer) to authenticated;
