-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260927102858. History: never edit.

-- Compare Intelligence v1 (4BJ, D166). Who reported a benchmark number, the methodology link and
-- when the source published it. Nullable: null reads as Not recorded and is never guessed.
alter table public.model_evaluations
  add column reporter_relation text
    check (reporter_relation is null or reporter_relation in ('provider','competitor','independent','third_party_cited')),
  add column methodology_url text check (methodology_url is null or methodology_url ~ '^https://'),
  add column published_at date;

-- Rule 12: the table is granted column by column. SELECT for the new columns, nothing else.
grant select (reporter_relation, methodology_url, published_at) on public.model_evaluations to anon, authenticated;

-- Hand backfill of the 39 rows, read one by one on 2026-09-27 from evaluator and the model's provider.
-- provider: measured and published by the model's own provider.
update public.model_evaluations e set reporter_relation = 'provider'
  from public.models m
  where m.id = e.model_id and m.provider = 'Anthropic' and e.evaluator in ('Anthropic','Published by Anthropic');
-- competitor: measured and published by another model provider (Anthropic's post measuring OpenAI models).
update public.model_evaluations e set reporter_relation = 'competitor'
  from public.models m
  where m.id = e.model_id and m.provider = 'OpenAI' and e.evaluator = 'Published by Anthropic';
-- third_party_cited: the provider's own number, relayed by somebody else.
update public.model_evaluations e set reporter_relation = 'third_party_cited'
  from public.models m
  where m.id = e.model_id and m.provider = 'OpenAI' and e.evaluator = 'OpenAI, as cited by Anthropic';
-- independent: measured by a party that ships no competing model (Zapier runs AutomationBench).
update public.model_evaluations set reporter_relation = 'independent' where evaluator = 'Zapier';
