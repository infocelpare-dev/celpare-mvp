-- Phase CRYPTO, D263: the customer chooses the coin on Celpare before paying.
-- The choice is sent to NOWPayments as the invoice pay_currency, so its page
-- opens on that coin, and is kept on the invoice so the admin sees which coin
-- each customer chose while the payment is still open. What was actually paid
-- is still crypto_payments.pay_currency, from the webhook.

alter table public.invoices
  add column if not exists pay_currency text
  check (pay_currency is null or pay_currency ~ '^(btc|eth|bnb[a-z0-9]*|xrp|usdt[a-z0-9]*)$');

comment on column public.invoices.pay_currency is
  'NOWPayments ticker the customer chose at checkout (D263), null when they choose on the NOWPayments page.';

drop function if exists public.billing_attach_checkout(uuid, text, text);

create function public.billing_attach_checkout(p_request uuid, p_invoice_id text, p_url text, p_pay_currency text default null)
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
  insert into public.invoices (request_id, number, amount_cents, currency, provider, provider_invoice_ref, payment_url, pay_currency)
  values (p_request, v_number, r.amount_cents, r.currency, 'nowpayments', btrim(p_invoice_id), p_url, nullif(lower(btrim(p_pay_currency)), ''));
  return v_number;
end;
$$;

revoke execute on function public.billing_attach_checkout(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.billing_attach_checkout(uuid, text, text, text) to service_role;
