-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20261007154827. History: never edit.

-- Catalogue search covers models as well as tools (founder, 2026-10-07).
-- Like search_tools (D39), the RETURN TYPE is the allowlist the AI may see, the
-- function is SECURITY INVOKER so RLS (approved only) still applies, and test
-- fixtures are left out (D13).
create or replace function public.search_models(q text, lim integer default 4)
returns table (
  slug text, name text, provider text, description text, context_window integer,
  input_price_per_m numeric, output_price_per_m numeric, modalities text[], tags text[], open_weights boolean
)
language sql
stable
set search_path = public, extensions
as $$
  with generic as (
    select l.lexeme from unnest(to_tsvector('english'::regconfig,
      'best good great top better ai llm llms model models tool tools app apps software use need want recommend find help compare vs which')) l
  ),
  terms as (
    select distinct l.lexeme
    from unnest(to_tsvector('english'::regconfig, coalesce(q, ''))) l
    where l.lexeme not in (select lexeme from generic)
  ),
  needed as (
    select count(*)::int as n, greatest(1, ceil(count(*) * 0.6))::int as k from terms
  ),
  scored as (
    select m.*,
      (select count(*) from terms x
        where m.search_vector @@ to_tsquery('english'::regconfig, quote_literal(x.lexeme))) as hits
    from public.models m
    where m.status = 'approved'
      and not ('test-fixture' = any(coalesce(m.tags, '{}')))
  )
  select s.slug::text, s.name, s.provider, left(coalesce(s.description, ''), 600),
         s.context_window, s.input_price_per_m, s.output_price_per_m,
         s.modalities, s.tags, s.open_weights
  from scored s cross join needed
  where needed.n > 0 and s.hits >= needed.k
  order by s.hits desc, s.release_date desc nulls last, s.name asc
  limit least(greatest(coalesce(lim, 4), 1), 8);
$$;

revoke all on function public.search_models(text, integer) from public;
grant execute on function public.search_models(text, integer) to anon, authenticated, service_role;
