-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20261005163344. History: never edit.

-- Sponsored Tools Ranking v1 (sponsored_tools_v1, D205). Builds on D204.

-- 1. Campaign fields. Flat fee for now (D205): bid_cents is the slot a later
--    bid or CPC model fills; null means the flat fee, equal for every sponsor.
alter table public.tool_sponsorships
  add column if not exists bid_cents integer
    check (bid_cents is null or (bid_cents >= 0 and bid_cents <= 1000000)),
  add column if not exists frequency_cap smallint
    check (frequency_cap is null or (frequency_cap >= 1 and frequency_cap <= 50)),
  add column if not exists ranking_version text not null default 'sponsored_tools_v1'
    check (ranking_version ~ '^[a-z]+(_[a-z]+)*_v[0-9]+$');

grant select (bid_cents, frequency_cap, ranking_version) on public.tool_sponsorships to authenticated;

-- 2. Events. Separate from search_events and recommendation_events so a paid
--    slot never trains an organic ranking (D204).
create table public.sponsored_events (
  id uuid primary key default gen_random_uuid(),
  sponsorship_id uuid references public.tool_sponsorships(id) on delete cascade,
  tool_id uuid not null references public.tools(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  viewer_key text not null check (viewer_key ~ '^[ua]:[A-Za-z0-9-]{8,64}$'),
  surface text not null check (surface in ('search', 'ask')),
  event text not null check (event in ('impression', 'view', 'click', 'conversion', 'dismiss', 'report')),
  position smallint check (position is null or (position >= 0 and position <= 2)),
  request_id uuid,
  query_key text check (query_key is null or query_key ~ '^[0-9a-f]{16,64}$'),
  algorithm text not null default 'sponsored_tools_v1' check (algorithm ~ '^[a-z]+(_[a-z]+)*_v[0-9]+$'),
  reason text check (reason is null or reason in ('irrelevant', 'misleading', 'offensive', 'spam', 'other')),
  created_at timestamptz not null default now()
);

create index sponsored_events_viewer_idx on public.sponsored_events (viewer_key, created_at desc);
create index sponsored_events_tool_idx on public.sponsored_events (tool_id, event, created_at desc);
create index sponsored_events_sponsorship_idx on public.sponsored_events (sponsorship_id, event);

-- pg_default_acl hands anon and authenticated everything on a new table.
revoke all on public.sponsored_events from public, anon, authenticated;
alter table public.sponsored_events enable row level security;
grant select on public.sponsored_events to authenticated;
create policy se_admin_select on public.sponsored_events
  for select to authenticated using (public.has_admin_capability('users.plan'));

-- 3. Running campaigns with everything the auction scores, one row per tool.
--    Service role only: performance counts are the advertiser's business.
create or replace function public.sponsored_campaigns()
returns table (
  sponsorship_id uuid, tool_id uuid, slug text, bid_cents integer, frequency_cap smallint,
  ranking_version text, ends_at timestamptz, verified boolean, rating numeric, rating_count integer,
  like_count integer, dislike_count integer, has_logo boolean, has_tagline boolean,
  has_description boolean, website_https boolean, domain_verified boolean,
  freshness_at timestamptz, categories text[], views_30d integer, clicks_30d integer,
  reporters_30d integer, open_reports integer
)
language sql stable security definer set search_path = public
as $$
  select s.id, t.id, t.slug::text, s.bid_cents, s.frequency_cap, s.ranking_version, s.ends_at,
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
         (select count(distinct e.viewer_key)::int from public.sponsored_events e
           where e.tool_id = t.id and e.event = 'report' and e.created_at > now() - interval '30 days'),
         (select count(*)::int from public.reports r
           where r.entity_type = 'tool' and r.entity_id = t.id and r.status in ('open', 'investigating'))
    from public.tool_sponsorships s
    join public.tools t on t.id = s.tool_id
   where s.status = 'active' and s.starts_at <= now() and s.ends_at > now()
     and t.status = 'approved';
$$;
revoke all on function public.sponsored_campaigns() from public, anon, authenticated;
grant execute on function public.sponsored_campaigns() to service_role;

-- 4. What one viewer has already been served on one surface: the frequency
--    cap, dismissals, and the previous serve for the consecutive rule.
create or replace function public.sponsored_viewer_state(p_viewer text, p_surface text)
returns table (tool_id uuid, served_24h integer, dismissed boolean, in_last_serve boolean, last_query_key text)
language sql stable security definer set search_path = public
as $$
  with last_serve as (
    select e.request_id, e.query_key
      from public.sponsored_events e
     where e.viewer_key = p_viewer and e.surface = p_surface and e.event = 'impression'
       and e.created_at > now() - interval '30 minutes'
     order by e.created_at desc limit 1
  ), mine as (
    select e.tool_id, e.event, e.request_id, e.created_at
      from public.sponsored_events e
     where e.viewer_key = p_viewer and e.created_at > now() - interval '30 days'
       and e.event in ('impression', 'dismiss')
  )
  select m.tool_id,
         count(*) filter (where m.event = 'impression' and m.created_at > now() - interval '24 hours')::int,
         bool_or(m.event = 'dismiss'),
         bool_or(m.event = 'impression' and m.request_id is not distinct from (select request_id from last_serve)
                 and (select request_id from last_serve) is not null),
         (select query_key from last_serve)
    from mine m
   group by m.tool_id;
$$;
revoke all on function public.sponsored_viewer_state(text, text) from public, anon, authenticated;
grant execute on function public.sponsored_viewer_state(text, text) to service_role;

-- 5. Record one serve. An impression is written once per viewer, tool,
--    surface and query in 30 minutes, so a reload or a tab switch on the same
--    search is one impression, not five.
create or replace function public.record_sponsored_serve(
  p_viewer text, p_user uuid, p_surface text, p_request uuid, p_query_key text, p_items jsonb
) returns integer
language plpgsql security definer set search_path = public
as $$
declare it jsonb; n integer := 0;
begin
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    if exists (
      select 1 from public.sponsored_events e
       where e.viewer_key = p_viewer and e.surface = p_surface and e.event = 'impression'
         and e.tool_id = (it->>'tool_id')::uuid
         and e.query_key is not distinct from p_query_key
         and e.created_at > now() - interval '30 minutes'
    ) then continue; end if;
    insert into public.sponsored_events
      (sponsorship_id, tool_id, user_id, viewer_key, surface, event, position, request_id, query_key, algorithm)
    values ((it->>'sponsorship_id')::uuid, (it->>'tool_id')::uuid, p_user, p_viewer, p_surface,
            'impression', (it->>'position')::smallint, p_request, p_query_key,
            coalesce(it->>'algorithm', 'sponsored_tools_v1'));
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.record_sponsored_serve(text, uuid, text, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.record_sponsored_serve(text, uuid, text, uuid, text, jsonb) to service_role;
