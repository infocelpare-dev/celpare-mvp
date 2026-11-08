-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260921103038. History: never edit.

create or replace function public.search_people_candidates(p_q text, p_limit integer default 30)
returns table (
  id uuid, username text, full_name text, avatar_url text, bio text,
  is_developer boolean, developer_verified boolean, company text,
  expertise text[], skills text[], interests text[],
  follower_count integer, created_at timestamptz,
  m_exact boolean, m_prefix boolean, m_name_sim real,
  m_ts real, m_terms integer, m_total_terms integer,
  m_skill boolean, m_expertise boolean, m_company boolean,
  sources text[]
)
language sql
stable
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
  with q as (
    select
      public.search_normalize(p_q)                as qq,
      -- The handle without its @, so "@ameag" and "ameag" are one query.
      ltrim(public.search_normalize(p_q), '@')     as handle,
      websearch_to_tsquery('english'::regconfig, public.search_normalize(p_q)) as tsq,
      public.search_prefix_tsquery(p_q, 'simple')  as pfx,
      (
        select array_agg(distinct tok)
        from regexp_split_to_table(ltrim(public.search_normalize(p_q), '@'), '[^a-z0-9+#._-]+') as tok
        where char_length(tok) >= 2
      )                                            as terms
  ),
  pool as (
    select pr.*, dp.verified as dev_verified, dp.company as dev_company,
           dp.expertise as dev_expertise
    from public.profiles pr
    left join public.developer_profiles dp on dp.id = pr.id
    cross join q
    where q.qq <> ''
      -- Only accounts that may be acted on. A suspended or disabled account
      -- cannot be followed or messaged, so every control on the row would fail,
      -- and offering one that is guaranteed to fail is defect F4. Their /u/ page
      -- still renders, so this is not a claim that they do not exist. The
      -- expiry rule is the same one is_active_account() uses, evaluated on read
      -- because there is no scheduler (D79).
      and (
        pr.account_status = 'active'
        or (pr.account_status = 'suspended'
            and pr.suspended_until is not null
            and pr.suspended_until <= now())
      )
      and pr.username is not null
      and (
        (q.tsq is not null and pr.search_vector @@ q.tsq)
        or (q.pfx is not null and pr.search_vector @@ q.pfx)
        or pr.username::text ilike '%' || q.handle || '%'
        or pr.full_name ilike '%' || q.qq || '%'
        or extensions.similarity(pr.username::text, q.handle) > 0.3
        or extensions.similarity(coalesce(pr.full_name, ''), q.qq) > 0.3
        or (q.terms is not null and pr.skills && q.terms)
        or (q.terms is not null and pr.interests && q.terms)
        or (q.terms is not null and dp.expertise && q.terms)
        or dp.company ilike '%' || q.qq || '%'
      )
  )
  select
    p.id, p.username::text, p.full_name, p.avatar_url, p.bio,
    p.is_developer, coalesce(p.dev_verified, false), p.dev_company,
    coalesce(p.dev_expertise, '{}'), coalesce(p.skills, '{}'), coalesce(p.interests, '{}'),
    p.follower_count, p.created_at,
    (p.username::text = q.handle or lower(coalesce(p.full_name, '')) = q.qq) as m_exact,
    (p.username::text like q.handle || '%' or p.full_name ilike q.qq || '%') as m_prefix,
    greatest(
      extensions.similarity(p.username::text, q.handle),
      extensions.similarity(coalesce(p.full_name, ''), q.qq)
    )::real                                                                 as m_name_sim,
    case when q.tsq is null then 0 else ts_rank_cd(p.search_vector, q.tsq) end::real as m_ts,
    (
      select count(*)::int from unnest(coalesce(q.terms, '{}')) tk
      where p.search_vector @@ to_tsquery('simple'::regconfig, quote_literal(tk) || ':*')
    )                                                                       as m_terms,
    coalesce(array_length(q.terms, 1), 0)                                   as m_total_terms,
    (q.terms is not null and coalesce(p.skills, '{}') && q.terms)           as m_skill,
    (q.terms is not null and coalesce(p.dev_expertise, '{}') && q.terms)    as m_expertise,
    (p.dev_company is not null and p.dev_company ilike '%' || q.qq || '%')  as m_company,
    array_remove(array[
      case when p.username::text = q.handle or lower(coalesce(p.full_name,'')) = q.qq then 'exact' end,
      case when p.username::text like q.handle || '%' then 'prefix' end,
      case when q.tsq is not null and p.search_vector @@ q.tsq then 'fts' end,
      case when q.pfx is not null and p.search_vector @@ q.pfx then 'fts_prefix' end,
      case when extensions.similarity(p.username::text, q.handle) > 0.3 then 'trigram' end,
      case when q.terms is not null and (coalesce(p.skills,'{}') && q.terms
             or coalesce(p.interests,'{}') && q.terms
             or coalesce(p.dev_expertise,'{}') && q.terms) then 'tag' end
    ], null)                                                                as sources
  from pool p
  cross join q
  order by
    (p.username::text = q.handle) desc,
    (p.username::text like q.handle || '%') desc,
    p.follower_count desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;

revoke all on function public.search_people_candidates(text, integer) from public;
grant execute on function public.search_people_candidates(text, integer) to anon, authenticated;

comment on function public.search_people_candidates(text, integer) is
'People retrieval. SECURITY DEFINER for two reasons that are both column level: account_status is not in any client grant, and profiles.search_vector was deliberately revoked. It returns a fixed public projection, the same doctrine search_tools uses for the AI boundary, so the definer cannot leak a column its signature does not name. email is not in that signature and is not granted to any client role either.';
