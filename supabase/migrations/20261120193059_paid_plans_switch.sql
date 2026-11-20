-- Paid plans are PAUSED, not removed (founder 2026-11-20, D271 as amended).
-- One switch, features.paid_plans in Admin, Settings, turns the individual
-- (Pro, Premium) and developer (Pro, Elite) plans on and off. Off is where it
-- starts: Celpare shows as free and only sponsorship is sold.

-- 1. The switch. Public, so pages read it before a session exists.
insert into public.platform_settings (key, category, value, description, is_public)
values (
  'features.paid_plans', 'features', 'false'::jsonb,
  'Paid plans for people (Pro, Premium) and developers (Pro, Elite). Off: Celpare shows as free and only sponsorship can be bought. Signed out pages that are prebuilt (pricing) change on the next deploy.',
  true
)
on conflict (key) do nothing;

-- 2. The plan prices follow the switch, so the database refuses a plan while
--    it is off (billing_submit_request and billing_start_checkout read active).
create or replace function public.paid_plans_switch_sync()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if new.key = 'features.paid_plans' then
    update public.billing_prices
       set active = (new.value = 'true'::jsonb)
     where kind in ('individual', 'developer');
  end if;
  return null;
end;
$$;

revoke execute on function public.paid_plans_switch_sync() from public, anon, authenticated;

drop trigger if exists paid_plans_switch_sync on public.platform_settings;
create trigger paid_plans_switch_sync
  after insert or update of value on public.platform_settings
  for each row execute function public.paid_plans_switch_sync();

update public.billing_prices
   set active = coalesce((select value = 'true'::jsonb from public.platform_settings where key = 'features.paid_plans'), false)
 where kind in ('individual', 'developer');

-- 3. A sponsorship gives Elite's perks on top of whatever developer plan is
--    bought. The plan is: elite while a sponsorship is active, else the
--    active developer subscription's plan, else free.
create or replace function public.developer_sponsor_sync(p_dev uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_plan text;
begin
  if p_dev is null then return; end if;
  if exists (
    select 1 from public.tool_sponsorships
     where developer_id = p_dev and status = 'active'
       and (ends_at is null or ends_at > now())
  ) then
    v_plan := 'elite';
  else
    select plan into v_plan from public.subscriptions
     where user_id = p_dev and kind = 'developer' and status = 'active'
     order by current_period_end desc limit 1;
    v_plan := coalesce(v_plan, 'free');
  end if;
  update public.developer_profiles
     set plan = v_plan, updated_at = now()
   where id = p_dev and plan is distinct from v_plan;
end;
$$;

revoke execute on function public.developer_sponsor_sync(uuid) from public, anon, authenticated;

-- 4. Nothing lowers a sponsored developer below elite: billing_activate,
--    billing_expire_due and the admin setter write the plan directly.
create or replace function public.developer_profiles_keep_sponsor_perks()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if new.plan is distinct from 'elite' and exists (
    select 1 from public.tool_sponsorships
     where developer_id = new.id and status = 'active'
       and (ends_at is null or ends_at > now())
  ) then
    new.plan := 'elite';
  end if;
  return new;
end;
$$;

revoke execute on function public.developer_profiles_keep_sponsor_perks() from public, anon, authenticated;

drop trigger if exists developer_profiles_keep_sponsor_perks on public.developer_profiles;
create trigger developer_profiles_keep_sponsor_perks
  before update of plan on public.developer_profiles
  for each row execute function public.developer_profiles_keep_sponsor_perks();

-- 5. The admin plan controls come back (revoked earlier today when the plans
--    were thought permanent).
grant execute on function public.admin_set_user_plan(uuid, text, text) to authenticated;
grant execute on function public.admin_set_developer_plan(uuid, text, text) to authenticated;
