-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260913095646. History: never edit.

-- websearch_to_tsquery ANDs every term, so the worked example from the product
-- spec, "I need an AI tool to turn long videos into TikTok clips", matched
-- nothing at all: no single row contains every word. People ask questions in
-- sentences, so the query has to OR the terms and let ranking decide.
--
-- The & to | swap is done on the output of websearch_to_tsquery rather than on
-- raw user text, so the sanitising that function does is still what stands
-- between a user string and to_tsquery.

create or replace function public.tools_tsquery(q text)
returns tsquery
language sql
immutable
parallel safe
set search_path to 'public'
as $function$
  select case
    when q is null or btrim(q) = '' then null::tsquery
    when websearch_to_tsquery('english'::regconfig, q)::text = '' then null::tsquery
    else to_tsquery('english'::regconfig,
           replace(websearch_to_tsquery('english'::regconfig, q)::text, '&', '|'))
  end;
$function$;

create or replace function public.search_tools(q text, lim integer default 8)
returns table (
  slug text,
  name text,
  description text,
  pricing text,
  tags text[],
  rating numeric,
  features text[]
)
language sql
stable
security invoker
set search_path to 'public', 'extensions'
as $function$
  with parsed as (select public.tools_tsquery(q) as tsq)
  select
    t.slug::text,
    t.name,
    left(coalesce(t.description, ''), 600),
    t.pricing,
    t.tags,
    t.rating,
    t.features
  from public.tools t, parsed p
  where t.status = 'approved'
    and (p.tsq is null or t.search_vector @@ p.tsq)
  order by
    case when p.tsq is null then 0 else ts_rank(t.search_vector, p.tsq) end desc,
    t.popularity_score desc,
    t.name asc
  limit least(greatest(coalesce(lim, 8), 1), 20);
$function$;

grant execute on function public.search_tools(text, integer) to anon, authenticated;
grant execute on function public.tools_tsquery(text) to anon, authenticated;
