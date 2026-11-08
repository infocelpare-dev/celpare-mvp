-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260927102806. History: never edit.

-- Compare Intelligence v1 (4BJ, D167). One measurement per row, with full provenance.
-- Empty on purpose: no source of performance data has been chosen, and every cell reads Not measured.
create table public.model_performance (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references public.models(id) on delete cascade,
  metric text not null check (metric in ('ttft_ms','output_tps','e2e_latency_ms','throughput_rps','uptime_pct')),
  value numeric not null check (value >= 0),
  unit text not null check (unit in ('ms','tokens_per_s','requests_per_s','percent')),
  provider_endpoint text check (provider_endpoint is null or char_length(provider_endpoint) <= 120),
  environment text check (environment is null or char_length(environment) <= 400),
  methodology_url text check (methodology_url is null or methodology_url ~ '^https://'),
  source_label text check (source_label is null or char_length(source_label) <= 200),
  source_url text check (source_url is null or source_url ~ '^https://'),
  measured_at timestamptz not null,
  verified_at timestamptz,
  source text not null default 'admin',
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint model_performance_uptime check (metric <> 'uptime_pct' or value <= 100),
  constraint model_performance_unit_matches check (
    (metric in ('ttft_ms','e2e_latency_ms') and unit = 'ms') or
    (metric = 'output_tps' and unit = 'tokens_per_s') or
    (metric = 'throughput_rps' and unit = 'requests_per_s') or
    (metric = 'uptime_pct' and unit = 'percent')),
  constraint model_performance_verified_needs_source check (verified_at is null or source_url is not null)
);

create unique index model_performance_one_measurement
  on public.model_performance (model_id, metric, coalesce(provider_endpoint, ''), measured_at);
create index model_performance_model on public.model_performance (model_id);

alter table public.model_performance enable row level security;

-- D119: nothing is granted by default. Revoke anyway, then grant column by column.
revoke all on public.model_performance from public, anon, authenticated;

create policy model_performance_select_public on public.model_performance
  for select to anon, authenticated
  using (exists (select 1 from public.models m where m.id = model_performance.model_id and m.status = 'approved'));

grant select (id, model_id, metric, value, unit, provider_endpoint, environment, methodology_url,
  source_label, source_url, measured_at, verified_at)
  on public.model_performance to anon, authenticated;
grant all on public.model_performance to service_role;
