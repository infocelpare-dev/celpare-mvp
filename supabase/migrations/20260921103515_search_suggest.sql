-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260921103515. History: never edit.

create or replace function public.search_suggest(p_q text, p_limit integer default 8)
returns table (kind text, label text, sublabel text, href text, weight real)
language sql
stable
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
  with q as (
    select public.search_normalize(p_q) as qq,
           ltrim(public.search_normalize(p_q), '@') as handle
  ),
  tools as (
    select 'tool'::text as kind, t.name as label, t.tagline as sublabel,
           '/tools/' || t.slug::text as href,
           (case when t.name ilike q.qq || '%' then 3.0 else 1.0 end
            + extensions.similarity(t.name, q.qq)
            + case when t.verified then 0.3 else 0 end)::real as weight
    from public.tools t, q
    where t.status = 'approved' and q.qq <> ''
      and (t.name ilike '%' || q.qq || '%' or extensions.similarity(t.name, q.qq) > 0.3)
    order by weight desc
    limit 6
  ),
  models as (
    select 'model'::text as kind, m.name as label, m.provider as sublabel,
           '/search?q=' || m.name as href,
           (case when m.name ilike q.qq || '%' then 3.0 else 1.0 end
            + extensions.similarity(m.name, q.qq))::real as weight
    from public.models m, q
    where m.status = 'approved' and q.qq <> ''
      and (m.name ilike '%' || q.qq || '%' or extensions.similarity(m.name, q.qq) > 0.3)
    order by weight desc
    limit 4
  ),
  people as (
    select 'person'::text as kind,
           coalesce(nullif(pr.full_name, ''), pr.username::text) as label,
           '@' || pr.username::text as sublabel,
           '/u/' || pr.username::text as href,
           (case when pr.username::text like q.handle || '%' then 3.0 else 1.0 end
            + extensions.similarity(pr.username::text, q.handle)
            + least(pr.follower_count, 50) / 100.0)::real as weight
    from public.profiles pr, q
    where q.qq <> '' and pr.username is not null
      and (pr.account_status = 'active'
           or (pr.account_status = 'suspended' and pr.suspended_until is not null
               and pr.suspended_until <= now()))
      and (pr.username::text ilike '%' || q.handle || '%'
           or pr.full_name ilike '%' || q.qq || '%')
    order by weight desc
    limit 4
  ),
  cats as (
    select 'category'::text as kind, c.name as label, 'Category'::text as sublabel,
           '/search?q=' || c.name as href, 1.5::real as weight
    from public.categories c, q
    where q.qq <> '' and c.name ilike '%' || q.qq || '%'
    limit 3
  ),
  topics as (
    select 'topic'::text as kind, tp.name as label, 'Community topic'::text as sublabel,
           '/community/topic/' || tp.slug::text as href, 1.2::real as weight
    from public.topics tp, q
    where q.qq <> '' and tp.name ilike '%' || q.qq || '%'
    limit 3
  ),
  mine as (
    select 'recent'::text as kind, s.query as label, 'Recent search'::text as sublabel,
           '/search?q=' || s.query as href, 4.0::real as weight
    from (
      select distinct on (se.normalized) se.query, se.normalized, se.created_at
      from public.search_events se, q
      where se.user_id = (select auth.uid())
        and (select auth.uid()) is not null
        and q.qq <> ''
        and se.normalized like q.qq || '%'
      order by se.normalized, se.created_at desc
    ) s
    order by s.created_at desc
    limit 3
  )
  select a.kind, a.label, a.sublabel, a.href, a.weight
  from (
    select * from mine
    union all select * from tools
    union all select * from models
    union all select * from people
    union all select * from cats
    union all select * from topics
  ) a
  order by a.weight desc, a.label asc
  limit greatest(1, least(coalesce(p_limit, 8), 20));
$$;

revoke all on function public.search_suggest(text, integer) from public;
grant execute on function public.search_suggest(text, integer) to anon, authenticated;

comment on function public.search_suggest(text, integer) is
'Autocomplete, and cheap by construction: prefix and trigram work against indexes only, no engagement aggregates and no behaviour joins, because this runs on a keystroke. SECURITY DEFINER only so the people arm can filter account_status; every arm asserts its own status condition and the recent arm filters on auth.uid(), so nobody ever sees another account''s searches.';
