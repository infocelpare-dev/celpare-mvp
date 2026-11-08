-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260930125737. History: never edit.

-- D194 step 1: read paths that respect privacy. Nothing is revoked here.

-- Your own account fields that nobody else may read.
create or replace function public.my_profile_private()
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select jsonb_build_object(
    'plan', p.plan,
    'ask_settings', p.ask_settings,
    'account_status', p.account_status,
    'status_reason', p.status_reason,
    'suspended_until', p.suspended_until,
    'bio', p.bio,
    'interests', p.interests,
    'skills', p.skills
  )
  from public.profiles p
  where p.id = (select auth.uid());
$function$;
revoke all on function public.my_profile_private() from public, anon;
grant execute on function public.my_profile_private() to authenticated;

-- What a person wrote about themselves, blank when the account is private and
-- the reader is not its owner (D86). The one read path for these columns.
create or replace function public.profile_written_fields(p_ids uuid[])
 returns table(id uuid, bio text, location text, website_url text, interests text[], skills text[])
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select p.id,
    case when v.ok then p.bio end,
    case when v.ok then p.location end,
    case when v.ok then p.website_url end,
    case when v.ok then coalesce(p.interests, '{}') else '{}' end,
    case when v.ok then coalesce(p.skills, '{}') else '{}' end
  from public.profiles p
  cross join lateral (select (not p.is_private) or p.id = (select auth.uid()) as ok) v
  where p.id = any(p_ids[1:200]);
$function$;
revoke all on function public.profile_written_fields(uuid[]) from public;
grant execute on function public.profile_written_fields(uuid[]) to anon, authenticated;

-- Suggestions: a private account's bio is not shown, and a private account
-- with nothing else to show is not suggested on its bio alone.
create or replace function public.suggested_people(p_limit integer default 5)
 returns table(id uuid, username text, full_name text, avatar_url text, bio text, is_developer boolean, developer_verified boolean, follower_count integer, created_at timestamp with time zone)
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select pr.id, pr.username::text, pr.full_name, pr.avatar_url,
         case when pr.is_private then null else pr.bio end,
         pr.is_developer, coalesce(dp.verified, false), pr.follower_count, pr.created_at
  from public.profiles pr
  left join public.developer_profiles dp on dp.id = pr.id
  where pr.username is not null
    and (pr.account_status = 'active'
         or (pr.account_status = 'suspended' and pr.suspended_until is not null
             and pr.suspended_until <= now()))
    and pr.id <> coalesce((select auth.uid()), '00000000-0000-0000-0000-000000000000'::uuid)
    and not exists (
      select 1 from public.follows f
      where f.follower_id = (select auth.uid()) and f.following_id = pr.id
    )
    and ((pr.bio is not null and not pr.is_private) or pr.full_name is not null or pr.is_developer)
  order by pr.follower_count desc, pr.created_at desc
  limit greatest(1, least(coalesce(p_limit, 5), 20));
$function$;

-- People search: a private account is found by its name and username only,
-- and returns no bio, skills or interests (D86, D194).
create or replace function public.search_people_candidates(p_q text, p_limit integer default 30)
 returns table(id uuid, username text, full_name text, avatar_url text, bio text, is_developer boolean, developer_verified boolean, company text, expertise text[], skills text[], interests text[], follower_count integer, created_at timestamp with time zone, m_exact boolean, m_prefix boolean, m_name_sim real, m_ts real, m_terms integer, m_total_terms integer, m_skill boolean, m_expertise boolean, m_company boolean, sources text[])
 language sql
 stable security definer
 set search_path to 'public', 'extensions', 'pg_temp'
as $function$
  with q as (
    select
      public.search_normalize(p_q)                as qq,
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
           dp.expertise as dev_expertise,
           ((not pr.is_private) or pr.id = (select auth.uid())) as open_profile
    from public.profiles pr
    left join public.developer_profiles dp on dp.id = pr.id
    cross join q
    where q.qq <> ''
      and (
        pr.account_status = 'active'
        or (pr.account_status = 'suspended'
            and pr.suspended_until is not null
            and pr.suspended_until <= now())
      )
      and pr.username is not null
      and (
        pr.username::text ilike '%' || q.handle || '%'
        or pr.full_name ilike '%' || q.qq || '%'
        or extensions.similarity(pr.username::text, q.handle) > 0.3
        or extensions.similarity(coalesce(pr.full_name, ''), q.qq) > 0.3
        or dp.company ilike '%' || q.qq || '%'
        or (dp.expertise is not null and q.terms is not null and dp.expertise && q.terms)
        or (
          ((not pr.is_private) or pr.id = (select auth.uid()))
          and (
            (q.tsq is not null and pr.search_vector @@ q.tsq)
            or (q.pfx is not null and pr.search_vector @@ q.pfx)
            or (q.terms is not null and pr.skills && q.terms)
            or (q.terms is not null and pr.interests && q.terms)
          )
        )
      )
  )
  select
    p.id, p.username::text, p.full_name, p.avatar_url,
    case when p.open_profile then p.bio end,
    p.is_developer, coalesce(p.dev_verified, false), p.dev_company,
    coalesce(p.dev_expertise, '{}'),
    case when p.open_profile then coalesce(p.skills, '{}') else '{}' end,
    case when p.open_profile then coalesce(p.interests, '{}') else '{}' end,
    p.follower_count, p.created_at,
    (p.username::text = q.handle or lower(coalesce(p.full_name, '')) = q.qq) as m_exact,
    (p.username::text like q.handle || '%' or p.full_name ilike q.qq || '%') as m_prefix,
    greatest(
      extensions.similarity(p.username::text, q.handle),
      extensions.similarity(coalesce(p.full_name, ''), q.qq)
    )::real                                                                 as m_name_sim,
    case when q.tsq is null or not p.open_profile then 0 else ts_rank_cd(p.search_vector, q.tsq) end::real as m_ts,
    case when p.open_profile then (
      select count(*)::int from unnest(coalesce(q.terms, '{}')) tk
      where p.search_vector @@ to_tsquery('simple'::regconfig, quote_literal(tk) || ':*')
    ) else 0 end                                                            as m_terms,
    coalesce(array_length(q.terms, 1), 0)                                   as m_total_terms,
    (p.open_profile and q.terms is not null and coalesce(p.skills, '{}') && q.terms) as m_skill,
    (q.terms is not null and coalesce(p.dev_expertise, '{}') && q.terms)    as m_expertise,
    (p.dev_company is not null and p.dev_company ilike '%' || q.qq || '%')  as m_company,
    array_remove(array[
      case when p.username::text = q.handle or lower(coalesce(p.full_name,'')) = q.qq then 'exact' end,
      case when p.username::text like q.handle || '%' then 'prefix' end,
      case when p.open_profile and q.tsq is not null and p.search_vector @@ q.tsq then 'fts' end,
      case when p.open_profile and q.pfx is not null and p.search_vector @@ q.pfx then 'fts_prefix' end,
      case when extensions.similarity(p.username::text, q.handle) > 0.3 then 'trigram' end,
      case when q.terms is not null and ((p.open_profile and (coalesce(p.skills,'{}') && q.terms
             or coalesce(p.interests,'{}') && q.terms))
             or coalesce(p.dev_expertise,'{}') && q.terms) then 'tag' end
    ], null)                                                                as sources
  from pool p
  cross join q
  order by
    (p.username::text = q.handle) desc,
    (p.username::text like q.handle || '%') desc,
    p.follower_count desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
$function$;
