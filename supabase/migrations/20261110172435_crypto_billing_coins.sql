-- Phase CRYPTO, D261 (supersedes D259): customers may pay in BTC, ETH, BNB,
-- XRP or USDT on any network NOWPayments offers for them. NOWPayments converts
-- to the founder's payout wallet (USDT on Ethereum). The price is still the
-- USD price Celpare set; NOWPayments marks a payment finished only when the
-- coin amount at its locked rate covers it, and partially_paid otherwise.
-- Only the coin check in billing_crypto_update changes.

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
    -- The price must be the one Celpare set, in USD, paid in an accepted coin (D261).
    if v_price_ccy <> 'usd' or v_price is null or round(v_price * 100) < r.amount_cents
       or v_pay_ccy !~ '^(btc|eth|bnb[a-z0-9]*|xrp|usdt[a-z0-9]*)$' then
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

revoke all on function public.billing_crypto_update(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.billing_crypto_update(uuid, jsonb) to service_role;
