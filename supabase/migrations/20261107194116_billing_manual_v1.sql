-- Phase BILL, manual subscriptions and invoices before Stripe (D239 to D242).
--
-- Additive only: new tables, functions, capabilities and one cron job. No
-- existing table, column, policy or function changes. Entitlement still lives
-- in profiles.plan, developer_profiles.plan and tool_sponsorships, written here
-- only by billing_activate and billing_expire_due, the same columns the admin
-- plan tools already write.
--
-- Flow: a signed in account submits a request (pending). An admin with
-- billing.manage starts review (under_review), sends a Payoneer invoice and
-- records it (invoice_sent), or rejects. Only billing.verify (super_admin, D242)
-- marks it paid, which needs the Payoneer transaction id and an explicit
-- verification, then activates. Nothing here accepts a file: a screenshot has
-- no way in (D239). An active subscription that reaches its end date expires
-- and drops to free the same day (D240).
--
-- Stripe later: provider columns, nullable Stripe ids, and one activation path
-- (billing_activate) a webhook can call.

-- 1. Capabilities ------------------------------------------------------------

insert into public.admin_capabilities (role, capability) values
  ('admin', 'billing.manage'),
  ('super_admin', 'billing.manage'),
  ('super_admin', 'billing.verify')
on conflict (role, capability) do nothing;

-- 2. Prices ------------------------------------------------------------------
-- The amount a request is billed is read from here, never from the browser.
-- Seeded from src/lib/pricing/plans.ts and src/lib/sponsored/config.ts; a test
-- fails if they disagree.

create table public.billing_prices (
  kind text not null check (kind in ('individual', 'developer', 'sponsorship')),
  plan text not null,
  period text not null check (period in ('monthly', 'yearly')),
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  stripe_price_id text check (stripe_price_id is null or char_length(stripe_price_id) <= 120),
  active boolean not null default true,
  primary key (kind, plan, period),
  check (
    (kind = 'individual' and plan in ('pro', 'premium'))
    or (kind = 'developer' and plan in ('pro', 'elite'))
    or (kind = 'sponsorship' and plan = 'sponsored')
  )
);

insert into public.billing_prices (kind, plan, period, amount_cents) values
  ('individual', 'pro', 'monthly', 799),
  ('individual', 'pro', 'yearly', 8999),
  ('individual', 'premium', 'monthly', 1999),
  ('individual', 'premium', 'yearly', 19999),
  ('developer', 'pro', 'monthly', 2000),
  ('developer', 'pro', 'yearly', 24000),
  ('developer', 'elite', 'monthly', 5000),
  ('developer', 'elite', 'yearly', 60000),
  ('sponsorship', 'sponsored', 'monthly', 14999);

-- 3. Requests ----------------------------------------------------------------

create table public.billing_requests (
  id uuid primary key default gen_random_uuid(),
  -- set null on account deletion: invoices are financial records and stay.
  user_id uuid references public.profiles (id) on delete set null,
  kind text not null check (kind in ('individual', 'developer', 'sponsorship')),
  plan text not null,
  period text not null check (period in ('monthly', 'yearly')),
  tool_id uuid references public.tools (id) on delete set null,
  amount_cents integer not null check (amount_cents > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  billing_name text not null check (char_length(btrim(billing_name)) between 1 and 120),
  billing_email text not null check (
    char_length(billing_email) <= 254
    and billing_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  company text check (company is null or char_length(company) <= 120),
  country text not null check (country ~ '^[A-Z]{2}$'),
  address text check (address is null or char_length(address) <= 500),
  tax_id text check (tax_id is null or char_length(tax_id) <= 64),
  note text check (note is null or char_length(note) <= 1000),
  status text not null default 'pending'
    check (status in ('pending', 'under_review', 'invoice_sent', 'paid', 'rejected')),
  reject_reason text check (reject_reason is null or char_length(reject_reason) <= 1000),
  provider text not null default 'manual' check (provider in ('manual', 'stripe')),
  subscription_id uuid,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (kind, plan, period) references public.billing_prices (kind, plan, period),
  -- Only a sponsorship names a tool. That a sponsorship has one is checked at
  -- submit: here tool_id may go null when the tool is deleted later.
  check (kind = 'sponsorship' or tool_id is null),
  check (status <> 'rejected' or reject_reason is not null)
);

-- One open request per account, kind and tool. "Open" ends at rejection or at
-- activation, so a renewal can follow.
create unique index billing_requests_one_open
  on public.billing_requests (user_id, kind, tool_id) nulls not distinct
  where status in ('pending', 'under_review', 'invoice_sent')
     or (status = 'paid' and activated_at is null);
create index billing_requests_status_idx on public.billing_requests (status, created_at desc);
create index billing_requests_user_idx on public.billing_requests (user_id, created_at desc);

-- 4. Invoices ----------------------------------------------------------------

create sequence public.billing_invoice_seq;

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.billing_requests (id) on delete restrict,
  number text not null unique check (number ~ '^CP-[0-9]{4}-[0-9]{4,}$'),
  amount_cents integer not null check (amount_cents > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  provider text not null default 'payoneer' check (provider in ('payoneer', 'stripe')),
  provider_invoice_ref text not null check (char_length(btrim(provider_invoice_ref)) between 1 and 120),
  status text not null default 'sent' check (status in ('sent', 'paid', 'void')),
  sent_at timestamptz not null default now(),
  sent_by uuid references public.profiles (id) on delete set null,
  due_at timestamptz,
  paid_at timestamptz,
  payment_ref text check (payment_ref is null or char_length(btrim(payment_ref)) between 1 and 120),
  verified_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  -- A paid invoice always names the transaction and who verified it.
  check (status <> 'paid' or (paid_at is not null and payment_ref is not null and verified_by is not null))
);

-- 5. Subscriptions -----------------------------------------------------------

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  kind text not null check (kind in ('individual', 'developer', 'sponsorship')),
  plan text not null,
  period text not null check (period in ('monthly', 'yearly')),
  tool_id uuid references public.tools (id) on delete set null,
  sponsorship_id uuid references public.tool_sponsorships (id) on delete set null,
  status text not null default 'active' check (status in ('active', 'expired', 'cancelled')),
  current_period_start timestamptz not null,
  current_period_end timestamptz not null,
  last_invoice_id uuid references public.invoices (id) on delete set null,
  provider text not null default 'manual' check (provider in ('manual', 'stripe')),
  provider_subscription_id text check (provider_subscription_id is null or char_length(provider_subscription_id) <= 120),
  ended_at timestamptz,
  end_reason text check (end_reason is null or char_length(end_reason) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (current_period_end > current_period_start)
);

create unique index subscriptions_one_active
  on public.subscriptions (user_id, kind, tool_id) nulls not distinct
  where status = 'active';
create index subscriptions_due_idx on public.subscriptions (current_period_end) where status = 'active';

alter table public.billing_requests
  add constraint billing_requests_subscription_fk
  foreign key (subscription_id) references public.subscriptions (id) on delete set null;

-- 6. Events, append only -----------------------------------------------------
-- The customer's timeline. `note` is customer facing (a reject reason); the
-- admin's verification note goes to admin_audit_log only.

create table public.billing_events (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.billing_requests (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  from_status text,
  to_status text not null,
  note text check (note is null or char_length(note) <= 1000),
  created_at timestamptz not null default now()
);
create index billing_events_request_idx on public.billing_events (request_id, id);

create function public.tg_billing_events_append_only()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'billing_events is append only' using errcode = '42501';
end;
$$;
-- ON DELETE CASCADE from a request is the only removal, and requests are never
-- deleted by any function here; a row delete trigger would block that cascade
-- too, so only UPDATE is refused.
create trigger billing_events_immutable before update on public.billing_events
  for each row execute function public.tg_billing_events_append_only();

-- 7. Access: nobody by default, then exactly what is needed -------------------

alter table public.billing_prices enable row level security;
alter table public.billing_requests enable row level security;
alter table public.invoices enable row level security;
alter table public.subscriptions enable row level security;
alter table public.billing_events enable row level security;

revoke all on public.billing_prices, public.billing_requests, public.invoices,
  public.subscriptions, public.billing_events from public, anon, authenticated;
revoke all on sequence public.billing_invoice_seq from public, anon, authenticated;

grant select on public.billing_prices to anon, authenticated;
grant select on public.billing_requests, public.invoices, public.subscriptions,
  public.billing_events to authenticated;

create policy bp_read on public.billing_prices for select to anon, authenticated
  using (active);

create policy br_read on public.billing_requests for select to authenticated
  using (user_id = (select auth.uid()) or public.has_admin_capability('billing.read'));

create policy inv_read on public.invoices for select to authenticated
  using (
    public.has_admin_capability('billing.read')
    or exists (select 1 from public.billing_requests r
               where r.id = invoices.request_id and r.user_id = (select auth.uid())));

create policy sub_read on public.subscriptions for select to authenticated
  using (user_id = (select auth.uid()) or public.has_admin_capability('billing.read'));

create policy be_read on public.billing_events for select to authenticated
  using (
    public.has_admin_capability('billing.read')
    or exists (select 1 from public.billing_requests r
               where r.id = billing_events.request_id and r.user_id = (select auth.uid())));

-- No insert, update or delete policy anywhere: every write is a function below.

-- 8. Internal helpers --------------------------------------------------------

create function public.billing_log(p_request uuid, p_from text, p_to text, p_note text default null)
returns void language sql security definer set search_path = '' as $$
  insert into public.billing_events (request_id, actor_id, from_status, to_status, note)
  values (p_request, (select auth.uid()), p_from, p_to, nullif(btrim(coalesce(p_note, '')), ''));
$$;

-- Moves a request one step, only along an allowed edge, under a row lock.
create function public.billing_step(p_id uuid, p_from text[], p_to text)
returns public.billing_requests language plpgsql security definer set search_path = '' as $$
declare r public.billing_requests;
begin
  select * into r from public.billing_requests where id = p_id for update;
  if r.id is null then raise exception 'request_not_found' using errcode = 'P0002'; end if;
  if not (r.status = any (p_from)) then
    raise exception 'invalid_transition:%>%', r.status, p_to using errcode = 'P0001';
  end if;
  return r;
end;
$$;

-- 9. Customer: submit a request ----------------------------------------------

create function public.billing_submit_request(
  p_kind text, p_plan text, p_period text, p_tool_id uuid,
  p_billing_name text, p_billing_email text, p_country text,
  p_company text default null, p_address text default null,
  p_tax_id text default null, p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_price public.billing_prices;
  v_id uuid;
begin
  if v_uid is null or not public.is_active_account() then
    raise exception 'not_authorised' using errcode = '42501';
  end if;

  select * into v_price from public.billing_prices
   where kind = p_kind and plan = p_plan and period = p_period and active;
  if v_price.kind is null then raise exception 'invalid_plan' using errcode = '22023'; end if;

  if p_kind in ('developer', 'sponsorship') and not public.is_active_developer() then
    raise exception 'developer_required' using errcode = '42501';
  end if;
  if p_kind = 'sponsorship' then
    if not exists (select 1 from public.tools
                   where id = p_tool_id and developer_id = v_uid and status = 'approved') then
      raise exception 'tool_not_eligible' using errcode = '22023';
    end if;
  elsif p_tool_id is not null then
    raise exception 'tool_not_expected' using errcode = '22023';
  end if;

  -- A ceiling on noise, well above any honest use.
  if (select count(*) from public.billing_requests
       where user_id = v_uid and created_at > now() - interval '1 day') >= 5 then
    raise exception 'too_many_requests' using errcode = '54000';
  end if;

  insert into public.billing_requests
    (user_id, kind, plan, period, tool_id, amount_cents, currency,
     billing_name, billing_email, company, country, address, tax_id, note)
  values
    (v_uid, p_kind, p_plan, p_period, p_tool_id, v_price.amount_cents, v_price.currency,
     btrim(p_billing_name), lower(btrim(p_billing_email)), nullif(btrim(coalesce(p_company, '')), ''),
     upper(btrim(p_country)), nullif(btrim(coalesce(p_address, '')), ''),
     nullif(btrim(coalesce(p_tax_id, '')), ''), nullif(btrim(coalesce(p_note, '')), ''))
  returning id into v_id;

  perform public.billing_log(v_id, null, 'pending');
  return v_id;
exception
  when unique_violation then
    raise exception 'request_already_open' using errcode = '23505';
end;
$$;

-- 10. Admin: review, invoice, reject (billing.manage) ------------------------

create function public.admin_billing_start_review(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.billing_requests;
begin
  perform public.admin_require('billing.manage');
  r := public.billing_step(p_id, array['pending'], 'under_review');
  update public.billing_requests
     set status = 'under_review', reviewed_by = (select auth.uid()), reviewed_at = now(), updated_at = now()
   where id = p_id;
  perform public.billing_log(p_id, r.status, 'under_review');
  perform public.admin_audit('billing.review_started', 'billing_request', p_id::text, r.billing_email, null,
    jsonb_build_object('status', r.status), jsonb_build_object('status', 'under_review'));
end;
$$;

create function public.admin_billing_mark_invoice_sent(p_id uuid, p_invoice_ref text, p_due_at timestamptz default null)
returns text language plpgsql security definer set search_path = '' as $$
declare r public.billing_requests; v_number text; v_seq text;
begin
  perform public.admin_require('billing.manage');
  if nullif(btrim(coalesce(p_invoice_ref, '')), '') is null then
    raise exception 'invoice_ref_required' using errcode = '22023';
  end if;
  r := public.billing_step(p_id, array['under_review'], 'invoice_sent');
  -- lpad would cut a number longer than 4 digits, so pad only up to 4.
  v_seq := nextval('public.billing_invoice_seq')::text;
  v_number := 'CP-' || to_char(now() at time zone 'UTC', 'YYYY') || '-'
              || lpad(v_seq, greatest(4, length(v_seq)), '0');
  insert into public.invoices (request_id, number, amount_cents, currency, provider_invoice_ref, sent_by, due_at)
  values (p_id, v_number, r.amount_cents, r.currency, btrim(p_invoice_ref), (select auth.uid()), p_due_at);
  update public.billing_requests set status = 'invoice_sent', updated_at = now() where id = p_id;
  perform public.billing_log(p_id, r.status, 'invoice_sent', v_number);
  perform public.admin_audit('billing.invoice_sent', 'billing_request', p_id::text, r.billing_email, null,
    jsonb_build_object('status', r.status),
    jsonb_build_object('status', 'invoice_sent', 'invoice', v_number, 'payoneer_ref', btrim(p_invoice_ref),
                       'amount_cents', r.amount_cents, 'currency', r.currency));
  return v_number;
end;
$$;

create function public.admin_billing_reject(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.billing_requests;
begin
  perform public.admin_require('billing.manage');
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  r := public.billing_step(p_id, array['pending', 'under_review', 'invoice_sent'], 'rejected');
  update public.invoices set status = 'void' where request_id = p_id and status = 'sent';
  update public.billing_requests
     set status = 'rejected', reject_reason = btrim(p_reason),
         decided_by = (select auth.uid()), decided_at = now(), updated_at = now()
   where id = p_id;
  perform public.billing_log(p_id, r.status, 'rejected', btrim(p_reason));
  perform public.admin_audit('billing.rejected', 'billing_request', p_id::text, r.billing_email, p_reason,
    jsonb_build_object('status', r.status), jsonb_build_object('status', 'rejected'));
end;
$$;

-- 11. Activation, the one path that grants a paid plan -----------------------
-- Not callable by any client role. admin_billing_activate calls it today; a
-- Stripe webhook running as service_role can call it later.

create function public.billing_activate(p_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  r public.billing_requests;
  inv public.invoices;
  s public.subscriptions;
  v_len interval;
  v_start timestamptz;
  v_end timestamptz;
  v_sub uuid;
  v_spons uuid;
  v_before text;
begin
  select * into r from public.billing_requests where id = p_id for update;
  if r.id is null then raise exception 'request_not_found' using errcode = 'P0002'; end if;
  if r.status <> 'paid' or r.activated_at is not null then
    raise exception 'not_activatable:%', r.status using errcode = 'P0001';
  end if;
  if r.user_id is null then raise exception 'account_gone' using errcode = 'P0002'; end if;
  select * into inv from public.invoices where request_id = p_id;
  if inv.status is distinct from 'paid' then
    raise exception 'invoice_not_paid' using errcode = 'P0001';
  end if;

  v_len := case r.period when 'yearly' then interval '1 year' else interval '1 month' end;

  select * into s from public.subscriptions
   where user_id = r.user_id and kind = r.kind and tool_id is not distinct from r.tool_id
     and status = 'active'
   for update;

  if s.id is not null and s.plan = r.plan then
    -- Renewal: extend from the current end, never from today.
    v_start := s.current_period_start;
    v_end := greatest(s.current_period_end, now()) + v_len;
    update public.subscriptions
       set current_period_end = v_end, period = r.period, last_invoice_id = inv.id, updated_at = now()
     where id = s.id;
    v_sub := s.id;
  else
    if s.id is not null then
      -- A plan change starts now and replaces the old run.
      update public.subscriptions
         set status = 'cancelled', ended_at = now(), end_reason = 'Replaced by ' || r.plan, updated_at = now()
       where id = s.id;
    end if;
    v_start := now();
    v_end := now() + v_len;
    insert into public.subscriptions
      (user_id, kind, plan, period, tool_id, current_period_start, current_period_end, last_invoice_id, provider)
    values (r.user_id, r.kind, r.plan, r.period, r.tool_id, v_start, v_end, inv.id, r.provider)
    returning id into v_sub;
  end if;

  if r.kind = 'individual' then
    select plan into v_before from public.profiles where id = r.user_id;
    update public.profiles set plan = r.plan, updated_at = now() where id = r.user_id;
  elsif r.kind = 'developer' then
    select plan into v_before from public.developer_profiles where id = r.user_id;
    if v_before is null then raise exception 'developer_not_found' using errcode = 'P0002'; end if;
    update public.developer_profiles set plan = r.plan, updated_at = now() where id = r.user_id;
  else
    select sponsorship_id into v_spons from public.subscriptions where id = v_sub;
    if v_spons is not null and exists (select 1 from public.tool_sponsorships where id = v_spons and status = 'active') then
      update public.tool_sponsorships set ends_at = v_end where id = v_spons;
    else
      insert into public.tool_sponsorships
        (tool_id, developer_id, status, price_cents, starts_at, ends_at, source, decided_by, decided_at)
      values (r.tool_id, r.user_id, 'active', r.amount_cents, now(), v_end, 'request', (select auth.uid()), now())
      returning id into v_spons;
      update public.subscriptions set sponsorship_id = v_spons where id = v_sub;
    end if;
  end if;

  update public.billing_requests
     set activated_at = now(), subscription_id = v_sub, updated_at = now()
   where id = p_id;
  perform public.billing_log(p_id, 'paid', 'active', to_char(v_end at time zone 'UTC', 'YYYY-MM-DD'));
  perform public.admin_audit('billing.subscription_activated', 'subscription', v_sub::text, r.billing_email, null,
    jsonb_build_object('plan', v_before),
    jsonb_build_object('kind', r.kind, 'plan', r.plan, 'period', r.period, 'tool', r.tool_id,
                       'start', v_start, 'end', v_end, 'invoice', inv.number));
  return v_sub;
end;
$$;

-- 12. Admin: mark paid and activate (billing.verify, super_admin only) -------

create function public.admin_billing_mark_paid(
  p_id uuid, p_payment_ref text, p_verified_in_payoneer boolean, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.billing_requests; v_number text;
begin
  perform public.admin_require('billing.verify');
  -- Never from a screenshot: the transaction must be named and confirmed as
  -- seen in the Payoneer account by the person marking it.
  if p_verified_in_payoneer is not true then
    raise exception 'verification_required' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_payment_ref, '')), '') is null then
    raise exception 'payment_ref_required' using errcode = '22023';
  end if;
  r := public.billing_step(p_id, array['invoice_sent'], 'paid');
  update public.invoices
     set status = 'paid', paid_at = now(), payment_ref = btrim(p_payment_ref), verified_by = (select auth.uid())
   where request_id = p_id and status = 'sent'
  returning number into v_number;
  if v_number is null then raise exception 'invoice_not_found' using errcode = 'P0002'; end if;
  update public.billing_requests
     set status = 'paid', decided_by = (select auth.uid()), decided_at = now(), updated_at = now()
   where id = p_id;
  perform public.billing_log(p_id, r.status, 'paid', v_number);
  perform public.admin_audit('billing.payment_verified', 'billing_request', p_id::text, r.billing_email, p_note,
    jsonb_build_object('status', r.status),
    jsonb_build_object('status', 'paid', 'invoice', v_number, 'payment_ref', btrim(p_payment_ref),
                       'verified_in_payoneer', true));
end;
$$;

create function public.admin_billing_activate(p_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  perform public.admin_require('billing.verify');
  return public.billing_activate(p_id);
end;
$$;

-- 13. Expiry, daily (D240: drop to free on the end date) ---------------------

create function public.billing_expire_due()
returns integer language plpgsql security definer set search_path = '' as $$
declare s record; v_n integer := 0;
begin
  for s in
    select * from public.subscriptions
     where status = 'active' and current_period_end <= now()
     for update skip locked
  loop
    update public.subscriptions
       set status = 'expired', ended_at = now(), end_reason = 'Period ended', updated_at = now()
     where id = s.id;
    if s.user_id is not null then
      if s.kind = 'individual' then
        update public.profiles set plan = 'free', updated_at = now()
         where id = s.user_id and plan = s.plan;
      elsif s.kind = 'developer' then
        update public.developer_profiles set plan = 'free', updated_at = now()
         where id = s.user_id and plan = s.plan;
      end if;
    end if;
    if s.sponsorship_id is not null then
      update public.tool_sponsorships
         set status = 'ended', ends_at = least(coalesce(ends_at, now()), now()),
             decision_reason = 'Subscription period ended', decided_at = now()
       where id = s.sponsorship_id and status = 'active';
    end if;
    perform public.admin_audit('billing.subscription_expired', 'subscription', s.id::text, null, 'Period ended',
      jsonb_build_object('status', 'active', 'plan', s.plan), jsonb_build_object('status', 'expired', 'plan', 'free'));
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

select cron.schedule('billing-expire-due', '15 0 * * *', 'select public.billing_expire_due()');

-- 14. Function access: revoke before grant (rule 6) --------------------------

revoke all on function public.tg_billing_events_append_only() from public, anon, authenticated;
revoke all on function public.billing_log(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.billing_step(uuid, text[], text) from public, anon, authenticated;
revoke all on function public.billing_activate(uuid) from public, anon, authenticated;
revoke all on function public.billing_expire_due() from public, anon, authenticated;
revoke all on function public.billing_submit_request(text, text, text, uuid, text, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.admin_billing_start_review(uuid) from public, anon, authenticated;
revoke all on function public.admin_billing_mark_invoice_sent(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.admin_billing_reject(uuid, text) from public, anon, authenticated;
revoke all on function public.admin_billing_mark_paid(uuid, text, boolean, text) from public, anon, authenticated;
revoke all on function public.admin_billing_activate(uuid) from public, anon, authenticated;

grant execute on function public.billing_submit_request(text, text, text, uuid, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.admin_billing_start_review(uuid) to authenticated;
grant execute on function public.admin_billing_mark_invoice_sent(uuid, text, timestamptz) to authenticated;
grant execute on function public.admin_billing_reject(uuid, text) to authenticated;
grant execute on function public.admin_billing_mark_paid(uuid, text, boolean, text) to authenticated;
grant execute on function public.admin_billing_activate(uuid) to authenticated;
grant execute on function public.billing_activate(uuid) to service_role;

-- 15. The switch that opens sales ---------------------------------------------
-- Off. The Request invoice buttons show only when an admin turns this on in
-- /admin/settings. The app reads it failing CLOSED (isBillingOpen), unlike the
-- other feature flags, so a missing or unreadable value never starts selling.

insert into public.platform_settings (key, category, value, description, is_public)
values ('features.billing_requests', 'features', 'false'::jsonb,
        'Paid plan requests by manual invoice (phase BILL). Off until the founder opens sales.', true)
on conflict (key) do nothing;
