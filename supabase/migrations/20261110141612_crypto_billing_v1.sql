-- Phase CRYPTO (D256 to D260): paid plans are paid in USDT through a
-- NOWPayments hosted invoice, and the plan turns on when a verified webhook
-- says the payment finished. Expand step: the Payoneer path stays in the
-- database (history, and the code live before this deploy) and is closed by a
-- later contract migration.
--
--   request (awaiting_payment) -> NOWPayments invoice (attach) ->
--   webhook, re-read from the NOWPayments API -> billing_crypto_update ->
--   paid -> billing_activate (the same audited function as before)

-- 1. Vocabulary ---------------------------------------------------------------

alter table public.billing_requests drop constraint billing_requests_status_check;
alter table public.billing_requests add constraint billing_requests_status_check check (status = any (array[
  'pending', 'under_review', 'invoice_sent',             -- Payoneer, history only
  'awaiting_payment', 'partially_paid', 'expired',       -- NOWPayments
  'paid', 'rejected']));

alter table public.billing_requests drop constraint billing_requests_provider_check;
alter table public.billing_requests add constraint billing_requests_provider_check
  check (provider = any (array['manual', 'stripe', 'nowpayments']));

alter table public.subscriptions drop constraint subscriptions_provider_check;
alter table public.subscriptions add constraint subscriptions_provider_check
  check (provider = any (array['manual', 'stripe', 'nowpayments']));

alter table public.invoices drop constraint invoices_provider_check;
alter table public.invoices add constraint invoices_provider_check
  check (provider = any (array['payoneer', 'stripe', 'nowpayments']));

-- A Payoneer invoice is paid only with a person's verification. A NOWPayments
-- one is paid by the verified webhook, so nobody is recorded as verifying it.
alter table public.invoices drop constraint invoices_check;
alter table public.invoices add constraint invoices_check check (
  status <> 'paid' or (paid_at is not null and payment_ref is not null
                       and (verified_by is not null or provider = 'nowpayments')));

-- Where the customer pays. Only ever a NOWPayments page.
alter table public.invoices add column payment_url text
  check (payment_url is null or (char_length(payment_url) <= 500
         and payment_url ~ '^https://([a-z0-9-]+\.)?nowpayments\.io/'));

-- One open request per plan kind, now counting the crypto states too, so a
-- person cannot hold two unpaid checkouts for the same thing.
drop index public.billing_requests_one_open;
create unique index billing_requests_one_open on public.billing_requests (user_id, kind, tool_id)
  nulls not distinct
  where status = any (array['pending', 'under_review', 'invoice_sent', 'awaiting_payment', 'partially_paid'])
     or (status = 'paid' and activated_at is null);

-- 2. What NOWPayments reported, per payment --------------------------------

create table public.crypto_payments (
  payment_id bigint primary key,
  request_id uuid not null references public.billing_requests(id) on delete restrict,
  provider_invoice_id text check (provider_invoice_id is null or char_length(provider_invoice_id) <= 64),
  status text not null check (char_length(status) <= 32),
  pay_currency text check (pay_currency is null or char_length(pay_currency) <= 32),
  pay_amount numeric,
  actually_paid numeric,
  price_amount numeric,
  price_currency text check (price_currency is null or char_length(price_currency) <= 8),
  outcome_amount numeric,
  outcome_currency text check (outcome_currency is null or char_length(outcome_currency) <= 32),
  payin_hash text check (payin_hash is null or char_length(payin_hash) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index crypto_payments_request_idx on public.crypto_payments (request_id);

-- D119: nobody by default. Read own or billing.read, written only by the
-- service role through billing_crypto_update.
revoke all on public.crypto_payments from public, anon, authenticated;
alter table public.crypto_payments enable row level security;
grant select on public.crypto_payments to authenticated;
create policy cp_read on public.crypto_payments for select to authenticated using (
  public.has_admin_capability('billing.read')
  or exists (select 1 from public.billing_requests r
             where r.id = crypto_payments.request_id and r.user_id = (select auth.uid())));

-- 3. Start a checkout (the customer) -----------------------------------------

create or replace function public.billing_start_checkout(
  p_kind text, p_plan text, p_period text, p_tool_id uuid,
  p_billing_name text, p_billing_email text, p_country text,
  p_company text, p_address text, p_tax_id text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_price public.billing_prices;
  v_id uuid;
  v_old record;
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
  if (select count(*) from public.billing_requests
       where user_id = v_uid and created_at > now() - interval '1 day') >= 10 then
    raise exception 'too_many_requests' using errcode = '54000';
  end if;

  -- An unpaid checkout for the same thing is replaced, so changing your mind
  -- (monthly to yearly, Pro to Premium) needs no support email. One where the
  -- coins are already on their way is not: it waits for the webhook.
  for v_old in
    select r.id from public.billing_requests r
     where r.user_id = v_uid and r.kind = p_kind and r.tool_id is not distinct from p_tool_id
       and r.status = 'awaiting_payment'
       and not exists (select 1 from public.crypto_payments c
                       where c.request_id = r.id
                         and c.status in ('confirming', 'confirmed', 'sending', 'finished'))
     for update
  loop
    update public.billing_requests set status = 'expired', updated_at = now() where id = v_old.id;
    update public.invoices set status = 'void' where request_id = v_old.id and status = 'sent';
    perform public.billing_log(v_old.id, 'awaiting_payment', 'expired', 'Replaced by a new checkout');
  end loop;

  insert into public.billing_requests
    (user_id, kind, plan, period, tool_id, amount_cents, currency, status, provider,
     billing_name, billing_email, company, country, address, tax_id)
  values
    (v_uid, p_kind, p_plan, p_period, p_tool_id, v_price.amount_cents, v_price.currency,
     'awaiting_payment', 'nowpayments',
     btrim(p_billing_name), lower(btrim(p_billing_email)), nullif(btrim(coalesce(p_company, '')), ''),
     upper(btrim(p_country)), nullif(btrim(coalesce(p_address, '')), ''),
     nullif(btrim(coalesce(p_tax_id, '')), ''))
  returning id into v_id;
  perform public.billing_log(v_id, null, 'awaiting_payment');
  return v_id;
exception
  when unique_violation then
    raise exception 'request_already_open' using errcode = '23505';
end;
$$;

-- 4. Record the NOWPayments invoice (the server, service role) --------------

create or replace function public.billing_attach_checkout(p_request uuid, p_invoice_id text, p_url text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare r public.billing_requests; v_number text; v_seq text;
begin
  r := public.billing_step(p_request, array['awaiting_payment'], 'awaiting_payment');
  if r.provider <> 'nowpayments' then raise exception 'wrong_provider' using errcode = '22023'; end if;
  if exists (select 1 from public.invoices where request_id = p_request) then
    raise exception 'invoice_exists' using errcode = '23505';
  end if;
  v_seq := nextval('public.billing_invoice_seq')::text;
  v_number := 'CP-' || to_char(now() at time zone 'UTC', 'YYYY') || '-' || lpad(v_seq, greatest(4, length(v_seq)), '0');
  insert into public.invoices (request_id, number, amount_cents, currency, provider, provider_invoice_ref, payment_url)
  values (p_request, v_number, r.amount_cents, r.currency, 'nowpayments', btrim(p_invoice_id), p_url);
  return v_number;
end;
$$;

-- 5. Apply a payment update (the webhook, service role) --------------------
--
-- p_payment is what GET /v1/payment/:id returned, never the webhook body: the
-- route verifies the signature AND re-reads the payment from NOWPayments.

create or replace function public.billing_crypto_update(p_request uuid, p_payment jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.billing_requests;
  inv public.invoices;
  v_status text := lower(coalesce(p_payment->>'payment_status', ''));
  v_pid bigint := (p_payment->>'payment_id')::bigint;
  v_price numeric := nullif(p_payment->>'price_amount', '')::numeric;
  v_price_ccy text := lower(coalesce(p_payment->>'price_currency', ''));
  v_pay_ccy text := lower(coalesce(p_payment->>'pay_currency', ''));
  v_old record;
begin
  if v_pid is null then raise exception 'payment_id_required' using errcode = '22023'; end if;
  select * into r from public.billing_requests where id = p_request for update;
  if r.id is null then raise exception 'request_not_found' using errcode = 'P0002'; end if;
  if r.provider <> 'nowpayments' then raise exception 'wrong_provider' using errcode = '22023'; end if;
  select * into inv from public.invoices where request_id = p_request;
  if inv.id is null or inv.provider <> 'nowpayments' then raise exception 'invoice_not_found' using errcode = 'P0002'; end if;
  -- A payment from another invoice cannot be applied to this request.
  if nullif(p_payment->>'invoice_id', '') is not null
     and (p_payment->>'invoice_id') is distinct from inv.provider_invoice_ref then
    raise exception 'invoice_mismatch' using errcode = '22023';
  end if;

  insert into public.crypto_payments as c
    (payment_id, request_id, provider_invoice_id, status, pay_currency, pay_amount, actually_paid,
     price_amount, price_currency, outcome_amount, outcome_currency, payin_hash)
  values
    (v_pid, p_request, p_payment->>'invoice_id', v_status, v_pay_ccy,
     nullif(p_payment->>'pay_amount', '')::numeric, nullif(p_payment->>'actually_paid', '')::numeric,
     v_price, v_price_ccy, nullif(p_payment->>'outcome_amount', '')::numeric,
     lower(p_payment->>'outcome_currency'), left(p_payment->>'payin_hash', 200))
  on conflict (payment_id) do update set
    status = excluded.status, actually_paid = excluded.actually_paid,
    outcome_amount = excluded.outcome_amount, outcome_currency = excluded.outcome_currency,
    payin_hash = coalesce(excluded.payin_hash, c.payin_hash), updated_at = now()
  where c.request_id = excluded.request_id;
  if not found then raise exception 'payment_belongs_elsewhere' using errcode = '22023'; end if;

  if v_status = 'finished' then
    if r.status = 'paid' then return 'already_paid'; end if;
    if r.status not in ('awaiting_payment', 'expired', 'partially_paid') then
      perform public.admin_audit('billing.crypto_unexpected', 'billing_request', p_request::text, r.billing_email,
        'Finished payment on a request in status ' || r.status, null, jsonb_build_object('payment_id', v_pid));
      return 'ignored:' || r.status;
    end if;
    -- The price must be the one Celpare set, in USD, paid in USDT (D259).
    if v_price_ccy <> 'usd' or v_price is null or round(v_price * 100) < r.amount_cents
       or v_pay_ccy not like 'usdt%' then
      perform public.admin_audit('billing.crypto_mismatch', 'billing_request', p_request::text, r.billing_email,
        'Finished payment does not match the request', null,
        jsonb_build_object('payment_id', v_pid, 'price', v_price, 'price_currency', v_price_ccy,
                           'pay_currency', v_pay_ccy, 'expected_cents', r.amount_cents));
      return 'mismatch';
    end if;
    -- A newer unpaid checkout for the same thing gives way to money received.
    for v_old in
      select id from public.billing_requests
       where user_id = r.user_id and kind = r.kind and tool_id is not distinct from r.tool_id
         and id <> r.id and status = 'awaiting_payment'
       for update
    loop
      update public.billing_requests set status = 'expired', updated_at = now() where id = v_old.id;
      update public.invoices set status = 'void' where request_id = v_old.id and status = 'sent';
      perform public.billing_log(v_old.id, 'awaiting_payment', 'expired', 'An earlier checkout was paid');
    end loop;
    update public.invoices set status = 'paid', paid_at = now(), payment_ref = v_pid::text
     where id = inv.id;
    update public.billing_requests set status = 'paid', decided_at = now(), updated_at = now()
     where id = p_request;
    perform public.billing_log(p_request, r.status, 'paid', 'NOWPayments ' || v_pid);
    perform public.admin_audit('billing.payment_received', 'billing_request', p_request::text, r.billing_email, null,
      jsonb_build_object('status', r.status),
      jsonb_build_object('status', 'paid', 'invoice', inv.number, 'payment_id', v_pid,
                         'pay_currency', v_pay_ccy, 'actually_paid', p_payment->>'actually_paid'));
    perform public.billing_activate(p_request);
    return 'activated';

  elsif v_status = 'partially_paid' then
    if r.status = 'awaiting_payment' then
      update public.billing_requests set status = 'partially_paid', updated_at = now() where id = p_request;
      perform public.billing_log(p_request, r.status, 'partially_paid', 'NOWPayments ' || v_pid);
      perform public.admin_audit('billing.payment_partial', 'billing_request', p_request::text, r.billing_email,
        null, jsonb_build_object('status', r.status),
        jsonb_build_object('status', 'partially_paid', 'payment_id', v_pid, 'actually_paid', p_payment->>'actually_paid'));
      return 'partial';
    end if;
    return 'noted';

  elsif v_status in ('expired', 'failed') then
    if r.status = 'awaiting_payment' then
      update public.billing_requests set status = 'expired', updated_at = now() where id = p_request;
      update public.invoices set status = 'void' where id = inv.id and status = 'sent';
      perform public.billing_log(p_request, r.status, 'expired', v_status);
      return 'expired';
    end if;
    return 'noted';

  elsif v_status = 'refunded' then
    perform public.admin_audit('billing.payment_refunded', 'billing_request', p_request::text, r.billing_email,
      null, null, jsonb_build_object('payment_id', v_pid));
    return 'refunded';
  end if;

  return 'progress';
end;
$$;

-- 6. The admin can close a crypto request that will not complete -----------

create or replace function public.admin_billing_reject(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare r public.billing_requests;
begin
  perform public.admin_require('billing.manage');
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  r := public.billing_step(p_id, array['pending', 'under_review', 'invoice_sent', 'awaiting_payment', 'partially_paid'], 'rejected');
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

-- 7. Who may call what (D250: revoke before grant) -------------------------

revoke execute on function public.billing_start_checkout(text, text, text, uuid, text, text, text, text, text, text) from public, anon;
grant execute on function public.billing_start_checkout(text, text, text, uuid, text, text, text, text, text, text) to authenticated;

revoke execute on function public.billing_attach_checkout(uuid, text, text) from public, anon, authenticated;
grant execute on function public.billing_attach_checkout(uuid, text, text) to service_role;

revoke execute on function public.billing_crypto_update(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.billing_crypto_update(uuid, jsonb) to service_role;
