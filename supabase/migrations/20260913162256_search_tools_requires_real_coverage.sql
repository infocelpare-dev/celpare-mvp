-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260913162256. History: never edit.

-- Tool search stops answering questions it did not understand.
--
-- The old version ORed the query terms together and, when the parsed query came
-- back empty, returned every approved tool ordered by popularity. Two bad
-- consequences, both seen live on 2026-09-13:
--
--   "which tool turns long videos into short TikTok clips" matched six video
--   GENERATION models, because they contain the word "video" and nothing in the
--   catalogue clips anything. The answer then had to open by saying the
--   catalogue has no match, while six irrelevant cards sat under it.
--
--   A question with no usable terms got the most popular tools, which is
--   recommendation by popularity, the one thing the product brief rules out.
--
-- Now a row must cover at least half the distinctive query terms to count as a
-- match. A single common word in common is not a match. When nothing clears the
-- bar the function returns no rows, which is the honest answer and the signal
-- the gateway needs to go and search the web instead.
--
-- The return type is unchanged: the same seven columns, which are the allowlist
-- (D39). This changes which ROWS come back, never which columns.
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
      t.*,
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
