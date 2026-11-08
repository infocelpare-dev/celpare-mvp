-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20261005165034. History: never edit.

drop function if exists public.sponsored_campaigns();
-- p_all: every run, live or not, for the admin debug view. Default: live only.
create function public.sponsored_campaigns(p_all boolean default false)
returns table (
  sponsorship_id uuid, tool_id uuid, slug text, status text, starts_at timestamptz, ends_at timestamptz,
  tool_status text, placement_suspended boolean, owner_active boolean, frequency_cap smallint,
  ranking_version text, verified boolean, rating numeric, rating_count integer,
  like_count integer, dislike_count integer, has_logo boolean, has_tagline boolean,
  has_description boolean, website_https boolean, domain_verified boolean,
  freshness_at timestamptz, categories text[], views_30d integer, clicks_30d integer,
  saves_30d integer, reporters_30d integer, open_reports integer
)
language sql stable security definer set search_path = public
as $$
  select s.id, t.id, t.slug::text, s.status, s.starts_at, s.ends_at,
         t.status, s.placement_suspended_at is not null, coalesce(p.account_status, 'active') = 'active',
         s.frequency_cap, s.ranking_version,
         t.verified, t.rating, t.rating_count, t.like_count, t.dislike_count,
         nullif(btrim(coalesce(t.logo_url, '')), '') is not null,
         nullif(btrim(coalesce(t.tagline, '')), '') is not null,
         char_length(coalesce(t.description, '')) >= 80,
         coalesce(t.website_url, '') ~* '^https://',
         t.domain_verified_at is not null,
         coalesce(t.updated_at, t.published_at, t.created_at),
         coalesce((select array_agg(lower(c.name) order by c.name)
                     from public.tool_categories tc join public.categories c on c.id = tc.category_id
                    where tc.tool_id = t.id), '{}'),
         (select count(*)::int from public.sponsored_events e
           where e.tool_id = t.id and e.event = 'view' and e.created_at > now() - interval '30 days'),
         (select count(*)::int from public.sponsored_events e
           where e.tool_id = t.id and e.event = 'click' and e.created_at > now() - interval '30 days'),
         (select count(*)::int from public.sponsored_events e
           where e.tool_id = t.id and e.event = 'save' and e.created_at > now() - interval '30 days'),
         (select count(distinct e.viewer_key)::int from public.sponsored_events e
           where e.tool_id = t.id and e.event = 'report' and e.created_at > now() - interval '30 days'),
         (select count(*)::int from public.reports r
           where r.entity_type = 'tool' and r.entity_id = t.id and r.status in ('open', 'investigating'))
    from public.tool_sponsorships s
    join public.tools t on t.id = s.tool_id
    left join public.profiles p on p.id = s.developer_id
   where p_all or (
         s.status = 'active' and s.starts_at <= now() and s.ends_at > now()
     and s.placement_suspended_at is null
     and t.status = 'approved'
     and coalesce(p.account_status, 'active') = 'active');
$$;
revoke all on function public.sponsored_campaigns(boolean) from public, anon, authenticated;
grant execute on function public.sponsored_campaigns(boolean) to service_role;

create or replace function public.sponsored_tool_ids()
returns setof uuid language sql stable security definer set search_path = public
as $$ select c.tool_id from public.sponsored_campaigns(false) c $$;

-- The admin debug view reads every run through its own session.
create or replace function public.admin_sponsored_campaigns()
returns setof record language plpgsql stable security definer set search_path = public
as $$ begin perform public.admin_require('users.plan'); return query select * from public.sponsored_campaigns(true); end $$;
drop function public.admin_sponsored_campaigns();
create function public.admin_sponsored_campaigns()
returns table (
  sponsorship_id uuid, tool_id uuid, slug text, status text, starts_at timestamptz, ends_at timestamptz,
  tool_status text, placement_suspended boolean, owner_active boolean, frequency_cap smallint,
  ranking_version text, verified boolean, rating numeric, rating_count integer,
  like_count integer, dislike_count integer, has_logo boolean, has_tagline boolean,
  has_description boolean, website_https boolean, domain_verified boolean,
  freshness_at timestamptz, categories text[], views_30d integer, clicks_30d integer,
  saves_30d integer, reporters_30d integer, open_reports integer
)
language plpgsql stable security definer set search_path = public
as $$ begin perform public.admin_require('users.plan'); return query select * from public.sponsored_campaigns(true); end $$;
revoke all on function public.admin_sponsored_campaigns() from public, anon;
grant execute on function public.admin_sponsored_campaigns() to authenticated;
