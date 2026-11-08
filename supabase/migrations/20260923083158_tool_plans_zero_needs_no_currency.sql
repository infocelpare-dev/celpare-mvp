-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260923083158. History: never edit.

-- A price of zero is not in any currency. Only a non zero price needs one.
alter table public.tool_plans drop constraint tool_plans_price_has_currency;
alter table public.tool_plans add constraint tool_plans_price_has_currency check (
  currency is not null
  or (coalesce(price_amount, 0) = 0 and coalesce(annual_price_amount, 0) = 0)
);
