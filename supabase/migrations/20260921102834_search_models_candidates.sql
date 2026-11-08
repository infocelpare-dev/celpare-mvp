-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260921102834. History: never edit.

create or replace function public.search_models_candidates(p_q text, p_limit integer default 40)
returns table (
  id uuid, slug text, name text, provider text, description text,
  context_window integer, input_price_per_m numeric, output_price_per_m numeric,
  modalities text[], tags text[], website_url text, created_at timestamptz,
  m_exact boolean, m_prefix boolean, m_name_sim real, m_phrase boolean,
  m_ts real, m_terms integer, m_total_terms integer,
  m_provider boolean, m_tag boolean, m_modality boolean,
  sources text[]
)
language sql
stable
set search_path to 'public', 'extensions'
as $$
  with q as (
    select
      public.search_normalize(p_q)                 as qq,
      websearch_to_tsquery('english'::regconfig, public.search_normalize(p_q)) as tsq,
      public.search_prefix_tsquery(p_q, 'english') as pfx,
      (
        select array_agg(distinct tok)
        from regexp_split_to_table(public.search_normalize(p_q), '[^a-z0-9+#._-]+') as tok
        where char_length(tok) >= 2
      )                                            as terms
  ),
  pool as (
    select m.*
    from public.models m, q
    where m.status = 'approved'
      and q.qq <> ''
      and (
        (q.tsq is not null and m.search_vector @@ q.tsq)
        or (q.pfx is not null and m.search_vector @@ q.pfx)
        or m.name ilike '%' || q.qq || '%'
        or m.provider ilike '%' || q.qq || '%'
        or extensions.similarity(m.name, q.qq) > 0.25
        or (q.terms is not null and m.tags && q.terms)
      )
  )
  select
    p.id, p.slug::text, p.name, p.provider, left(coalesce(p.description, ''), 400),
    p.context_window, p.input_price_per_m, p.output_price_per_m,
    coalesce(p.modalities, '{}'), coalesce(p.tags, '{}'), p.website_url, p.created_at,
    (lower(p.name) = q.qq or p.slug::text = q.qq)                       as m_exact,
    (p.name ilike q.qq || '%' or p.slug::text like q.qq || '%')         as m_prefix,
    extensions.similarity(p.name, q.qq)::real                           as m_name_sim,
    (q.qq <> '' and p.search_vector @@ phraseto_tsquery('english'::regconfig, q.qq)) as m_phrase,
    case when q.tsq is null then 0 else ts_rank_cd(p.search_vector, q.tsq) end::real as m_ts,
    (
      select count(*)::int from unnest(coalesce(q.terms, '{}')) tk
      where p.search_vector @@ to_tsquery('english'::regconfig, quote_literal(tk) || ':*')
    )                                                                   as m_terms,
    coalesce(array_length(q.terms, 1), 0)                               as m_total_terms,
    (q.terms is not null and lower(coalesce(p.provider, '')) = any (q.terms)) as m_provider,
    (q.terms is not null and coalesce(p.tags, '{}') && q.terms)         as m_tag,
    (q.terms is not null and coalesce(p.modalities, '{}') && q.terms)   as m_modality,
    array_remove(array[
      case when lower(p.name) = q.qq or p.slug::text = q.qq then 'exact' end,
      case when p.name ilike q.qq || '%' then 'prefix' end,
      case when q.tsq is not null and p.search_vector @@ q.tsq then 'fts' end,
      case when q.pfx is not null and p.search_vector @@ q.pfx then 'fts_prefix' end,
      case when extensions.similarity(p.name, q.qq) > 0.25 then 'trigram' end,
      case when q.terms is not null and coalesce(p.tags, '{}') && q.terms then 'tag' end
    ], null)                                                            as sources
  from pool p
  cross join q
  order by
    (lower(p.name) = q.qq) desc,
    (p.name ilike q.qq || '%') desc,
    case when q.tsq is null then 0 else ts_rank_cd(p.search_vector, q.tsq) end desc
  limit least(greatest(coalesce(p_limit, 40), 1), 200);
$$;

revoke all on function public.search_models_candidates(text, integer) from public;
grant execute on function public.search_models_candidates(text, integer) to anon, authenticated;
