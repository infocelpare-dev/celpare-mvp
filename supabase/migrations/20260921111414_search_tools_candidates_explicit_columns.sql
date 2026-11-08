-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260921111414. History: never edit.

-- `select t.*` NEEDS SELECT ON EVERY COLUMN, and anon has it on 28 of the 32:
-- dislike_count, owner_email, domain_verified_by and domain_verified_note are
-- deliberately not granted. So the pool CTE raised 42501 "permission denied for
-- table tools" for every signed out search, while the build, tsc and eslint were
-- all perfectly happy. This is the trap RESUME rule 8 records, which took Ask
-- Celpare's catalogue down once already, and it was caught here by running the
-- function as anon rather than by reading it.
--
-- The columns are named now. Nothing else changed.
create or replace function public.search_tools_candidates(p_q text, p_limit integer default 60)
returns table (
  id uuid, slug text, name text, tagline text, description text, logo_url text,
  pricing text, pricing_model text, tags text[], features text[], platforms text[],
  categories text[], rating numeric, rating_count integer, like_count integer,
  verified boolean, created_at timestamptz, published_at timestamptz,
  m_exact boolean, m_prefix boolean, m_name_sim real, m_phrase boolean,
  m_ts real, m_terms integer, m_total_terms integer,
  m_category boolean, m_tag boolean, m_feature boolean, m_platform boolean,
  sources text[]
)
language sql
stable
set search_path to 'public', 'extensions'
as $$
  with q as (
    select
      public.search_normalize(p_q)                  as qq,
      public.tools_tsquery(p_q)                     as tsq,
      public.search_prefix_tsquery(p_q, 'english')  as pfx,
      (
        select array_agg(distinct tok)
        from regexp_split_to_table(public.search_normalize(p_q), '[^a-z0-9+#._-]+') as tok
        where char_length(tok) >= 2
      )                                             as terms
    ),
  pool as (
    select
      t.id, t.slug, t.name, t.tagline, t.description, t.logo_url, t.pricing,
      t.pricing_model, t.tags, t.features, t.platforms, t.rating, t.rating_count,
      t.like_count, t.verified, t.created_at, t.published_at, t.search_vector
    from public.tools t, q
    where t.status = 'approved'
      and q.qq <> ''
      and (
        (q.tsq is not null and t.search_vector @@ q.tsq)
        or (q.pfx is not null and t.search_vector @@ q.pfx)
        or t.name ilike '%' || q.qq || '%'
        or t.slug::text ilike '%' || q.qq || '%'
        or extensions.similarity(t.name, q.qq) > 0.25
        or (q.terms is not null and t.tags && q.terms)
      )
  ),
  cat as (
    select tc.tool_id, array_agg(c.name order by c.sort_order) as names,
           array_agg(c.slug::text) as slugs
    from public.tool_categories tc
    join public.categories c on c.id = tc.category_id
    group by tc.tool_id
  )
  select
    p.id, p.slug::text, p.name, p.tagline, left(coalesce(p.description, ''), 400),
    p.logo_url, p.pricing, p.pricing_model,
    coalesce(p.tags, '{}'), coalesce(p.features, '{}'), coalesce(p.platforms, '{}'),
    coalesce(cat.names, '{}'),
    p.rating, p.rating_count, p.like_count, p.verified, p.created_at, p.published_at,
    (lower(p.name) = q.qq or p.slug::text = q.qq)                        as m_exact,
    (p.name ilike q.qq || '%' or p.slug::text like q.qq || '%')          as m_prefix,
    extensions.similarity(p.name, q.qq)::real                            as m_name_sim,
    (q.qq <> '' and p.search_vector @@ phraseto_tsquery('english'::regconfig, q.qq)) as m_phrase,
    case when q.tsq is null then 0 else ts_rank_cd(p.search_vector, q.tsq) end::real as m_ts,
    (
      select count(*)::int from unnest(coalesce(q.terms, '{}')) tk
      where p.search_vector @@ to_tsquery('english'::regconfig, quote_literal(tk) || ':*')
    )                                                                    as m_terms,
    coalesce(array_length(q.terms, 1), 0)                                as m_total_terms,
    (q.terms is not null and (
        exists (select 1 from unnest(coalesce(cat.names, '{}')) n
                 where lower(n) = any (q.terms) or lower(n) ilike '%' || q.qq || '%')
     or exists (select 1 from unnest(coalesce(cat.slugs, '{}')) s where s = any (q.terms))
    ))                                                                   as m_category,
    (q.terms is not null and coalesce(p.tags, '{}') && q.terms)          as m_tag,
    (q.terms is not null and exists (
       select 1 from unnest(coalesce(p.features, '{}')) f
       where lower(f) ilike '%' || q.qq || '%'
          or exists (select 1 from unnest(q.terms) tk where lower(f) ilike '%' || tk || '%')
    ))                                                                   as m_feature,
    (q.terms is not null and exists (
       select 1 from unnest(coalesce(p.platforms, '{}')) pl where lower(pl) = any (q.terms)
    ))                                                                   as m_platform,
    array_remove(array[
      case when lower(p.name) = q.qq or p.slug::text = q.qq then 'exact' end,
      case when p.name ilike q.qq || '%' then 'prefix' end,
      case when q.tsq is not null and p.search_vector @@ q.tsq then 'fts' end,
      case when q.pfx is not null and p.search_vector @@ q.pfx then 'fts_prefix' end,
      case when extensions.similarity(p.name, q.qq) > 0.25 then 'trigram' end,
      case when q.terms is not null and coalesce(p.tags, '{}') && q.terms then 'tag' end
    ], null)                                                             as sources
  from pool p
  cross join q
  left join cat on cat.tool_id = p.id
  order by
    (lower(p.name) = q.qq or p.slug::text = q.qq) desc,
    (p.name ilike q.qq || '%') desc,
    case when q.tsq is null then 0 else ts_rank_cd(p.search_vector, q.tsq) end desc,
    extensions.similarity(p.name, q.qq) desc
  limit least(greatest(coalesce(p_limit, 60), 1), 200);
$$;

revoke all on function public.search_tools_candidates(text, integer) from public;
grant execute on function public.search_tools_candidates(text, integer) to anon, authenticated;
