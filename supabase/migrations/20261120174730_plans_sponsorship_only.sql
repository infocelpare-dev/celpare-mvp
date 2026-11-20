-- Plans removed, sponsorship only (founder 2026-11-20, D271).
--
-- 1. Individual (Pro, Premium) and developer (Pro, Elite) plans are no longer
--    sold. Their price rows go inactive, so billing_submit_request and
--    billing_start_checkout refuse them server side. The rows stay for history.
-- 2. Every account is on Free. Active individual and developer subscriptions
--    are cancelled; their invoices stay on record.
-- 3. A developer with an active tool sponsorship gets what Elite gave
--    (analytics, the verified tick request, the developer badge). The plan
--    column keeps the value 'elite' so every existing gate reads it unchanged;
--    developer_sponsor_sync is now the only thing that writes it.

update public.billing_prices
   set active = false
 where kind in ('individual', 'developer') and active;

update public.subscriptions
   set status = 'cancelled', ended_at = now(),
       end_reason = 'Plans discontinued 2026-11-20', updated_at = now()
 where kind in ('individual', 'developer') and status = 'active';

update public.profiles
   set plan = 'free', updated_at = now()
 where plan <> 'free';

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
  v_plan := case
    when exists (
      select 1 from public.tool_sponsorships
       where developer_id = p_dev
         and status = 'active'
         and (ends_at is null or ends_at > now())
    ) then 'elite'
    else 'free'
  end;
  -- developer_profiles_plan_sync then drops request verified ticks and pending
  -- requests when the plan leaves elite.
  update public.developer_profiles
     set plan = v_plan, updated_at = now()
   where id = p_dev and plan is distinct from v_plan;
end;
$$;

revoke execute on function public.developer_sponsor_sync(uuid) from public, anon, authenticated;

create or replace function public.tool_sponsorships_developer_sync()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.developer_sponsor_sync(old.developer_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.developer_id is distinct from
     (case when tg_op = 'UPDATE' then old.developer_id end) then
    perform public.developer_sponsor_sync(new.developer_id);
  end if;
  return null;
end;
$$;

revoke execute on function public.tool_sponsorships_developer_sync() from public, anon, authenticated;

drop trigger if exists tool_sponsorships_developer_sync on public.tool_sponsorships;
create trigger tool_sponsorships_developer_sync
  after insert or update of status, ends_at, developer_id or delete
  on public.tool_sponsorships
  for each row execute function public.tool_sponsorships_developer_sync();

-- Bring every developer in line now: no active sponsorships exist today, so
-- this leaves everyone on free.
select public.developer_sponsor_sync(id) from public.developer_profiles;
