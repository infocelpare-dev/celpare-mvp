-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20261005164801. History: never edit.

-- Founder, 2026-10-05: no bid of any kind (D205). Every active $149.99
-- sponsorship has the same eligibility; relevance and quality decide order.
alter table public.tool_sponsorships drop column if exists bid_cents;

-- Admin can pause placement without ending the paid run.
alter table public.tool_sponsorships
  add column if not exists placement_suspended_at timestamptz,
  add column if not exists placement_suspended_reason text
    check (placement_suspended_reason is null or char_length(placement_suspended_reason) <= 1000),
  add column if not exists placement_suspended_by uuid references auth.users(id) on delete set null;
grant select (placement_suspended_at, placement_suspended_reason) on public.tool_sponsorships to authenticated;

alter table public.sponsored_events drop constraint if exists sponsored_events_event_check;
alter table public.sponsored_events add constraint sponsored_events_event_check
  check (event in ('impression', 'view', 'click', 'save', 'conversion', 'dismiss', 'report'));

drop function if exists public.sponsored_campaigns();
create function public.sponsored_campaigns()
returns table (
  sponsorship_id uuid, tool_id uuid, slug text, frequency_cap smallint,
  ranking_version text, ends_at timestamptz, verified boolean, rating numeric, rating_count integer,
  like_count integer, dislike_count integer, has_logo boolean, has_tagline boolean,
  has_description boolean, website_https boolean, domain_verified boolean,
  freshness_at timestamptz, categories text[], views_30d integer, clicks_30d integer,
  saves_30d integer, reporters_30d integer, open_reports integer
)
language sql stable security definer set search_path = public
as $$
  select s.id, t.id, t.slug::text, s.frequency_cap, s.ranking_version, s.ends_at,
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
   where s.status = 'active' and s.starts_at <= now() and s.ends_at > now()
     and s.placement_suspended_at is null
     and t.status = 'approved'
     and coalesce(p.account_status, 'active') = 'active';
$$;
revoke all on function public.sponsored_campaigns() from public, anon, authenticated;
grant execute on function public.sponsored_campaigns() to service_role;

-- sponsored_tool_ids() (D204) agrees with the campaigns list.
create or replace function public.sponsored_tool_ids()
returns setof uuid language sql stable security definer set search_path = public
as $$ select c.tool_id from public.sponsored_campaigns() c $$;

-- Suspend or restore placement. The paid run keeps its dates.
create or replace function public.admin_set_sponsorship_placement(p_id uuid, p_suspend boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = public
as $$
declare r public.tool_sponsorships; v_name text;
begin
  perform public.admin_require('users.plan');
  select * into r from public.tool_sponsorships where id = p_id for update;
  if r.id is null then raise exception 'sponsorship_not_found' using errcode = 'P0002'; end if;
  if p_suspend and nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  select name into v_name from public.tools where id = r.tool_id;
  update public.tool_sponsorships
     set placement_suspended_at = case when p_suspend then now() else null end,
         placement_suspended_reason = case when p_suspend then btrim(p_reason) else null end,
         placement_suspended_by = case when p_suspend then (select auth.uid()) else null end
   where id = r.id;
  perform public.admin_audit(case when p_suspend then 'tool.sponsorship_placement_suspended' else 'tool.sponsorship_placement_restored' end,
    'tool', r.tool_id::text, v_name, p_reason,
    jsonb_build_object('sponsorship', r.id, 'suspended_at', r.placement_suspended_at),
    jsonb_build_object('sponsorship', r.id, 'suspend', p_suspend));
end $$;
revoke all on function public.admin_set_sponsorship_placement(uuid, boolean, text) from public, anon;
grant execute on function public.admin_set_sponsorship_placement(uuid, boolean, text) to authenticated;

-- Aggregate counts for the admin page. Never per person.
create or replace function public.admin_sponsorship_stats(p_days integer default 30)
returns table (sponsorship_id uuid, event text, n integer, ask integer, search integer)
language plpgsql stable security definer set search_path = public
as $$
begin
  perform public.admin_require('users.plan');
  return query
    select e.sponsorship_id, e.event, count(*)::int,
           count(*) filter (where e.surface = 'ask')::int,
           count(*) filter (where e.surface = 'search')::int
      from public.sponsored_events e
     where e.created_at > now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365)))
       and e.sponsorship_id is not null
     group by e.sponsorship_id, e.event;
end $$;
revoke all on function public.admin_sponsorship_stats(integer) from public, anon;
grant execute on function public.admin_sponsorship_stats(integer) to authenticated;
