-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260916142915. History: never edit.

-- search_tools was selecting t.*, which needs SELECT on every column of tools
-- for the CALLING role, because the function is security invoker. Adding
-- owner_email, a column no client may read, therefore broke the whole
-- catalogue for anon and authenticated the moment the grant was narrowed.
--
-- This is the second time a narrowed grant has broken this function, so the
-- fix is the one that stops it happening a third time: name the columns. The
-- function now depends on nine columns instead of on all of them, and a new
-- column can never break it again.

create or replace function public.search_tools(q text, lim integer default 8)
returns table(slug text, name text, description text, pricing text, tags text[], rating numeric, features text[])
language sql
stable
set search_path to 'public', 'extensions'
as $function$
  with lex as (
    select distinct l.lexeme
    from unnest(to_tsvector('english'::regconfig, coalesce(q, ''))) l
  ),
  total as (
    select greatest(count(*), 1)::numeric as n
    from public.tools
    where status = 'approved'
  ),
  -- The same rule tools_tsquery uses: a term in more than a quarter of the
  -- catalogue carries no information, so it cannot earn a match on its own.
  distinctive as (
    select lex.lexeme
    from lex
    left join public.tool_terms tt on tt.word = lex.lexeme
    cross join total
    where coalesce(tt.ndoc, 0)::numeric / total.n <= 0.25
  ),
  terms as (
    select lexeme from distinctive
    union all
    -- Every term was common. Fall back to all of them rather than to nothing,
    -- so a question made entirely of ordinary words still searches.
    select lexeme from lex where not exists (select 1 from distinctive)
  ),
  needed as (
    select count(*)::int as n, greatest(1, ceil(count(*) * 0.5))::int as k
    from terms
  ),
  scored as (
    select
      t.slug,
      t.name,
      t.description,
      t.pricing,
      t.tags,
      t.rating,
      t.features,
      t.popularity_score,
      (
        select count(*)
        from terms x
        where t.search_vector @@ to_tsquery('english'::regconfig, quote_literal(x.lexeme))
      ) as hits,
      case
        when public.tools_tsquery(q) is null then 0
        else ts_rank(t.search_vector, public.tools_tsquery(q))
      end as rank
    from public.tools t
    where t.status = 'approved'
  )
  select
    s.slug::text,
    s.name,
    left(coalesce(s.description, ''), 600),
    s.pricing,
    s.tags,
    s.rating,
    s.features
  from scored s
  cross join needed
  where needed.n > 0
    and s.hits >= needed.k
  order by s.hits desc, s.rank desc, s.popularity_score desc, s.name asc
  limit least(greatest(coalesce(lim, 8), 1), 20);
$function$;

-- search_vector is read inside that function as the caller, so the caller
-- needs it. It was in the grant before the previous migration narrowed it and
-- should never have been dropped.
grant select (search_vector) on public.tools to anon, authenticated;

revoke all on function public.search_tools(text, integer) from public;
grant execute on function public.search_tools(text, integer) to anon, authenticated;
