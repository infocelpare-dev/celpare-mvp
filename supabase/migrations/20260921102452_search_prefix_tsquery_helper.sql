-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260921102452. History: never edit.

-- The prefix arm of retrieval, as a tsquery.
--
-- to_tsvector('english','clau') is not a prefix of 'claude', so full text
-- search alone cannot answer a half typed word. This builds `'clau':* | 'cod':*`
-- from the raw query so a partial word still retrieves.
--
-- OR rather than AND, deliberately. "best ai coding tools" ANDed across four
-- prefixes returns nothing; the RANKER is what rewards a candidate that hit
-- three terms over one that hit one. Retrieval widens, ranking narrows.
--
-- Tokens keep + # . _ - so gpt-4, c++, node.js and gpt_4 survive as themselves.
-- quote_literal is what makes the result injection safe: every token becomes a
-- quoted lexeme, so a query of `foo & !bar` cannot become tsquery operators.
create or replace function public.search_prefix_tsquery(p_q text, p_config regconfig default 'english')
returns tsquery
language plpgsql
immutable
set search_path to 'public'
as $$
declare
  v_expr text;
begin
  if p_q is null or btrim(p_q) = '' then
    return null;
  end if;

  select string_agg(quote_literal(tok) || ':*', ' | ')
  into v_expr
  from (
    select distinct left(tok, 40) as tok
    from regexp_split_to_table(lower(btrim(p_q)), '[^a-z0-9+#._-]+') as tok
    where char_length(tok) >= 2
    limit 8
  ) t;

  if v_expr is null then
    return null;
  end if;

  -- A malformed token is not worth failing a whole search over.
  begin
    return to_tsquery(p_config, v_expr);
  exception when others then
    return null;
  end;
end;
$$;

revoke all on function public.search_prefix_tsquery(text, regconfig) from public;
grant execute on function public.search_prefix_tsquery(text, regconfig) to anon, authenticated;

-- The normalized form, shared by history, analytics and retrieval so all three
-- agree on what "the same search" means. Mirrors normalize() in telemetry.ts.
create or replace function public.search_normalize(p_q text)
returns text
language sql
immutable
set search_path to 'public'
as $$
  select left(btrim(regexp_replace(lower(coalesce(p_q, '')), '\s+', ' ', 'g')), 200);
$$;

revoke all on function public.search_normalize(text) from public;
grant execute on function public.search_normalize(text) to anon, authenticated;
