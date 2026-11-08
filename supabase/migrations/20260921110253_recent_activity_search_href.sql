-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260921110253. History: never edit.

-- A search in Recent activity pointed at /explore?q=, and nothing on /explore
-- reads a q, so every one of those links dropped the query and opened the browse
-- page. There is a query surface now, so it points there and the link runs the
-- search again, which is what a recent search is for.
create or replace function public.my_recent_activity(p_limit integer default 20)
returns table (kind text, occurred_at timestamptz, label text, href text, detail text)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  with me as (select auth.uid() as uid),
  -- One row per distinct search, the most recent time it was run. Somebody who
  -- retypes the same query four times has done one thing worth listing.
  searches as (
    select distinct on (s.normalized)
      'search'::text            as kind,
      s.created_at              as occurred_at,
      s.query                   as label,
      '/search?q=' || replace(replace(replace(s.query, '%', '%25'), '&', '%26'), '#', '%23') as href,
      case
        when s.result_count = 1 then '1 result'
        else s.result_count::text || ' results'
      end                       as detail
    from public.search_events s, me
    where s.user_id = me.uid
    order by s.normalized, s.created_at desc
  ),
  -- Same rule for tools: the last time you opened it, not every time.
  -- Joined to tools rather than trusting the event row, so a tool that was
  -- removed or unpublished since simply drops out of the list.
  views as (
    select distinct on (v.tool_id)
      'tool'::text              as kind,
      v.created_at              as occurred_at,
      t.name                    as label,
      '/tools/' || t.slug       as href,
      t.tagline                 as detail
    from public.tool_view_events v
    join public.tools t on t.id = v.tool_id
    cross join me
    where v.user_id = me.uid
      and t.status = 'approved'
    order by v.tool_id, v.created_at desc
  )
  select kind, occurred_at, label, href, detail
  from (select * from searches union all select * from views) both_kinds
  where (select uid from me) is not null
  order by occurred_at desc
  limit greatest(1, least(coalesce(p_limit, 20), 50));
$$;
