-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260921103533. History: never edit.

-- Popular searches, for related searches and the zero result page.
--
-- THE THRESHOLD IS A PRIVACY CONTROL, NOT A QUALITY ONE. A popular searches list
-- built from a handful of accounts republishes individual people's queries to
-- everybody. At least three DISTINCT accounts before a query counts, and anything
-- containing an @ is excluded because that is somebody looking for a person or
-- typing an address. With two real accounts this correctly returns nothing, which
-- is the honest answer rather than an invented one (D30).
create or replace function public.popular_searches(p_limit integer default 6)
returns table (query text, uses integer)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select
    (array_agg(s.query order by s.created_at desc))[1] as query,
    count(*)::int as uses
  from public.search_events s
  where s.created_at > now() - interval '90 days'
    and s.result_count > 0
    and s.query not like '%@%'
    and char_length(s.normalized) >= 3
  group by s.normalized
  having count(distinct s.user_id) >= 3
  order by count(*) desc
  limit greatest(1, least(coalesce(p_limit, 6), 20));
$$;

revoke all on function public.popular_searches(integer) from public;
grant execute on function public.popular_searches(integer) to anon, authenticated;

create or replace function public.suggested_people(p_limit integer default 5)
returns table (
  id uuid, username text, full_name text, avatar_url text, bio text,
  is_developer boolean, developer_verified boolean, follower_count integer,
  created_at timestamptz
)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select pr.id, pr.username::text, pr.full_name, pr.avatar_url, pr.bio,
         pr.is_developer, coalesce(dp.verified, false), pr.follower_count, pr.created_at
  from public.profiles pr
  left join public.developer_profiles dp on dp.id = pr.id
  where pr.username is not null
    and (pr.account_status = 'active'
         or (pr.account_status = 'suspended' and pr.suspended_until is not null
             and pr.suspended_until <= now()))
    -- Never yourself, and never somebody you already follow: a suggestion you
    -- have already acted on is a wasted row.
    and pr.id <> coalesce((select auth.uid()), '00000000-0000-0000-0000-000000000000'::uuid)
    and not exists (
      select 1 from public.follows f
      where f.follower_id = (select auth.uid()) and f.following_id = pr.id
    )
    -- Something to show. A row with no name, no bio and no developer flag is not
    -- a suggestion, it is a blank.
    and (pr.bio is not null or pr.full_name is not null or pr.is_developer)
  order by pr.follower_count desc, pr.created_at desc
  limit greatest(1, least(coalesce(p_limit, 5), 20));
$$;

revoke all on function public.suggested_people(integer) from public;
grant execute on function public.suggested_people(integer) to anon, authenticated;
