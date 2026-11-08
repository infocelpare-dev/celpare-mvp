-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260921103247. History: never edit.

-- Post retrieval. Ids and signals only.
--
-- It returns ids rather than post rows on purpose: the feed already has one
-- definition of what a post is (POST_SELECT in src/lib/community/queries.ts,
-- with its author, topic, tool, model and media joins) and a second shape here
-- would drift from it. The caller loads the rows through that same path, so
-- posts_select_anon and posts_select_auth are evaluated twice, once here and
-- once there, and profile_shares() comes along for free both times.
create or replace function public.search_posts_candidates(p_q text, p_limit integer default 30)
returns table (
  id uuid, author_id uuid, created_at timestamptz,
  like_count integer, comment_count integer, save_count integer,
  m_phrase boolean, m_ts real, m_terms integer, m_total_terms integer,
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
  )
  select
    p.id, p.author_id, p.created_at, p.like_count, p.comment_count, p.save_count,
    (p.search_vector @@ phraseto_tsquery('english'::regconfig, q.qq))     as m_phrase,
    case when q.tsq is null then 0 else ts_rank_cd(p.search_vector, q.tsq) end::real as m_ts,
    (
      select count(*)::int from unnest(coalesce(q.terms, '{}')) tk
      where p.search_vector @@ to_tsquery('english'::regconfig, quote_literal(tk) || ':*')
    )                                                                    as m_terms,
    coalesce(array_length(q.terms, 1), 0)                                as m_total_terms,
    array_remove(array[
      case when q.tsq is not null and p.search_vector @@ q.tsq then 'fts' end,
      case when q.pfx is not null and p.search_vector @@ q.pfx then 'fts_prefix' end
    ], null)                                                             as sources
  from public.posts p
  cross join q
  where q.qq <> ''
    and p.status = 'visible'
    and p.deleted_at is null
    and (
      (q.tsq is not null and p.search_vector @@ q.tsq)
      or (q.pfx is not null and p.search_vector @@ q.pfx)
    )
  order by
    case when q.tsq is null then 0 else ts_rank_cd(p.search_vector, q.tsq) end desc,
    p.created_at desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;

revoke all on function public.search_posts_candidates(text, integer) from public;
grant execute on function public.search_posts_candidates(text, integer) to anon, authenticated;
