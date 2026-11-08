-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260913095915. History: never edit.

-- Postgres full text search has no IDF, so in an OR query the word "ai" counts
-- as much as the word "clips". In a catalogue of AI tools that is fatal: every
-- row matches "ai" and "tool", the ranks bunch together, and a question about
-- video clipping returned Claude ahead of Runway.
--
-- The fix is to drop query terms that are too common in this corpus to carry
-- meaning, which is IDF done by hand. Document frequency is materialised so
-- this costs an index lookup per term rather than a scan per query.

create materialized view if not exists public.tool_term_df as
select word, ndoc
from ts_stat('select search_vector from public.tools where status = ''approved''');

create unique index if not exists tool_term_df_word_idx on public.tool_term_df (word);

-- Not exposed through the API. It is an internal ranking artefact.
revoke all on public.tool_term_df from anon, authenticated;

create or replace function public.refresh_tool_term_df()
returns void
language sql
security definer
set search_path to 'public'
as $function$ refresh materialized view concurrently public.tool_term_df $function$;

revoke all on function public.refresh_tool_term_df() from public, anon, authenticated;

-- Now STABLE rather than IMMUTABLE: it reads the corpus statistics.
create or replace function public.tools_tsquery(q text)
returns tsquery
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  total numeric;
  kept text;
  fallback text;
begin
  if q is null or btrim(q) = '' then
    return null;
  end if;

  select greatest(count(*), 1)::numeric into total
  from public.tools where status = 'approved';

  -- Every distinct lexeme in the question, and the subset that is rare enough
  -- to be worth searching on. 25 percent is the line: a word in more than a
  -- quarter of the catalogue tells us nothing about which quarter.
  with lex as (
    select distinct l.lexeme
    from unnest(to_tsvector('english'::regconfig, q)) l
  )
  select
    string_agg(quote_literal(lex.lexeme), ' | ')
      filter (where coalesce(df.ndoc, 0)::numeric / total <= 0.25),
    string_agg(quote_literal(lex.lexeme), ' | ')
  into kept, fallback
  from lex
  left join public.tool_term_df df on df.word = lex.lexeme;

  -- If every word was too common, the question was generic. Fall back to all
  -- of them rather than returning the whole catalogue in arbitrary order.
  if kept is null and fallback is null then
    return null;
  end if;

  return to_tsquery('english'::regconfig, coalesce(kept, fallback));
end;
$function$;

grant execute on function public.tools_tsquery(text) to anon, authenticated;

refresh materialized view public.tool_term_df;
