-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260923100015. History: never edit.

-- What Ask Celpare may see about models and benchmarks, and nothing else (D39).
-- The return type is the allowlist: no ids, no internal columns, no listing URLs.
-- SECURITY INVOKER, so the approved-only policies still apply underneath.
create or replace function public.model_evidence_for_ai(p_benchmarks text[] default null)
returns table (
  model text,
  provider text,
  input_price_per_m numeric,
  output_price_per_m numeric,
  context_window integer,
  benchmark text,
  category text,
  score numeric,
  unit text,
  note text,
  measured_by text,
  published date,
  source_label text,
  source_url text,
  compare_slug text
)
language sql
stable
security invoker
set search_path = public
as $$
  select m.name, m.provider, m.input_price_per_m, m.output_price_per_m, m.context_window,
         b.name, b.category, e.score, e.unit, e.note, e.evaluator, e.evaluated_at,
         e.source_label, e.source_url, m.slug::text
  from public.model_evaluations e
  join public.models m on m.id = e.model_id and m.status = 'approved'
  join public.benchmarks b on b.slug = e.benchmark_slug
  where e.kind = 'benchmark'
    and (p_benchmarks is null or b.slug = any (p_benchmarks))
  order by b.name, e.score desc
  limit 120;
$$;
revoke all on function public.model_evidence_for_ai(text[]) from public;
grant execute on function public.model_evidence_for_ai(text[]) to anon, authenticated;
