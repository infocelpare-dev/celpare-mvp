-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260923095423. History: never edit.

-- The benchmarks themselves, and the results Anthropic published on 2026-09-22 for
-- Claude Opus 5.5 against Fable 5.1, Opus 5, GPT-6 Astra and GPT-5.6 Sol.
-- Source: https://www.anthropic.com/claude-opus-5-5 . Every number below is copied
-- from that table; a dash there is no row here. Who ran each result is recorded,
-- because the page says some GPT figures are as reported by OpenAI and that
-- AutomationBench was run by Zapier.

-- 1. Wider domains, a note per result, and a link to the benchmark it is on.
alter table public.model_evaluations drop constraint if exists model_evaluations_domain_check;
alter table public.model_evaluations add constraint model_evaluations_domain_check check (
  domain in ('reasoning', 'coding', 'knowledge', 'math', 'long_context', 'multimodal', 'agentic',
             'preference', 'business', 'science', 'computer_use', 'other'));
alter table public.model_evaluations
  add column note text check (note is null or char_length(note) <= 280);

-- 2. The benchmark catalogue. What it measures, how to read it, and which jobs it
-- is evidence for. Read by Compare and by Ask Celpare, so both say the same thing.
create table public.benchmarks (
  slug text primary key check (slug ~ '^[a-z0-9][a-z0-9-]{1,60}$'),
  name text not null unique check (char_length(name) between 1 and 80),
  domain text not null,
  category text not null check (char_length(category) between 1 and 60),
  measures text not null check (char_length(measures) between 1 and 400),
  how_to_read text not null check (char_length(how_to_read) between 1 and 300),
  use_cases text[] not null default '{}'
    check (use_cases <@ array['coding','research','writing','image','video','business','agents','api','personal']),
  source_label text not null,
  source_url text not null check (source_url ~ '^https://'),
  verified_at timestamptz,
  source text not null default 'admin' check (source in ('admin', 'import')),
  submitted_at timestamptz not null default now()
);
alter table public.benchmarks enable row level security;
revoke all on public.benchmarks from anon, authenticated;
grant select on public.benchmarks to anon, authenticated;
create policy benchmarks_select on public.benchmarks for select to anon, authenticated using (true);

alter table public.model_evaluations
  add column benchmark_slug text references public.benchmarks(slug) on update cascade;
grant select (note, benchmark_slug) on public.model_evaluations to anon, authenticated;

insert into public.benchmarks (slug, name, domain, category, measures, how_to_read, use_cases, source_label, source_url, verified_at) values
 ('terminal-bench', 'Terminal-Bench 4.0', 'coding', 'Agentic coding',
  'Multi step professional tasks done in a real command line: the model runs commands, edits files and has to finish the job on its own.',
  'Percent of tasks completed. Higher is better. Reported with a standard error of about 2 to 3 points, so small gaps are within noise.',
  '{coding,agents,api}', 'Claude Opus 5.5 announcement', 'https://www.anthropic.com/claude-opus-5-5', now()),
 ('frontiercode', 'FrontierCode v1.1 (Main)', 'coding', 'Agentic coding',
  'Whether the code changes a model makes would actually be merged, judged on real repository tasks.',
  'Percent of changes that would be merged. Higher is better.',
  '{coding}', 'Claude Opus 5.5 announcement', 'https://www.anthropic.com/claude-opus-5-5', now()),
 ('cursorbench', 'CursorBench 4.0', 'coding', 'Agentic coding',
  'Coding agents on ambiguous, multi file tasks taken from real coding sessions.',
  'Percent of tasks solved. Higher is better.',
  '{coding,agents}', 'Claude Opus 5.5 announcement', 'https://www.anthropic.com/claude-opus-5-5', now()),
 ('gdpval-aa', 'GDPval-AA v2.1', 'knowledge', 'Knowledge work',
  'Real professional work across 44 occupations, with the outputs compared head to head.',
  'A relative rating, not a percentage. Higher is better, and it only means something against other ratings on the same leaderboard.',
  '{business,writing,research}', 'Claude Opus 5.5 announcement', 'https://www.anthropic.com/claude-opus-5-5', now()),
 ('automationbench', 'AutomationBench', 'business', 'Business workflows',
  'Carrying out business workflows across connected applications.',
  'Percent of workflows completed. Higher is better. These results were run by Zapier.',
  '{business,agents}', 'Claude Opus 5.5 announcement', 'https://www.anthropic.com/claude-opus-5-5', now()),
 ('humanitys-last-exam', 'Humanity''s Last Exam', 'reasoning', 'Multidisciplinary reasoning',
  'Very hard, expert level questions across many academic subjects.',
  'Percent answered correctly. Higher is better. The results recorded here were run with tools, which scores higher than without.',
  '{research}', 'Claude Opus 5.5 announcement', 'https://www.anthropic.com/claude-opus-5-5', now()),
 ('terminal-bench-science', 'Terminal-Bench-Science 0.1', 'science', 'Agentic scientific research',
  'Scientific research tasks carried out by an agent in a command line environment.',
  'Percent of tasks completed. Higher is better. Standard error is about 3.5 to 5 points, so small gaps are within noise.',
  '{research,agents}', 'Claude Opus 5.5 announcement', 'https://www.anthropic.com/claude-opus-5-5', now()),
 ('osworld', 'OSWorld 2.0', 'computer_use', 'Computer use',
  'Operating a real computer: clicking, typing and moving between apps to finish tasks.',
  'Percent of tasks completed. Higher is better. The results recorded here are marked partial by their source.',
  '{agents}', 'Claude Opus 5.5 announcement', 'https://www.anthropic.com/claude-opus-5-5', now()),
 ('chartography', 'Chartography', 'multimodal', 'Visual chart recognition',
  'Reading and analysing charts and figures.',
  'Percent answered correctly. Higher is better. The results recorded here were run with tools.',
  '{research,business}', 'Claude Opus 5.5 announcement', 'https://www.anthropic.com/claude-opus-5-5', now());

-- 3. The three models in the table that were not in the catalogue yet, from the
-- OpenRouter models API like the others (D117).
alter table public.models disable trigger models_submission_guard;
insert into public.models (slug, name, provider, description, family, api_model_id, context_window,
  max_output_tokens, modalities, output_modalities, input_price_per_m, output_price_per_m,
  cached_input_price_per_m, cache_write_price_per_m, batch_input_price_per_m, batch_output_price_per_m,
  pricing_note, pricing_source_url, pricing_verified_at, tags, website_url, status, source, submitted_at)
values
 ('claude-fable-5-1', 'Claude Fable 5.1', 'Anthropic',
  'Improves on Claude Fable 5 across the board, with the biggest gains in agentic coding, long running agentic workflows and knowledge work.',
  'Claude', 'anthropic/claude-fable-5.1', 1000000, 128000, '{text,image,file}', '{text}',
  10, 50, 0.25, 12.5, 5, 25,
  'Cache writes held for 1 hour cost $20 per 1M tokens. Web search $0.01 per request.',
  'https://openrouter.ai/anthropic/claude-fable-5.1', now(), '{reasoning,coding,agents}', 'https://www.anthropic.com/claude', 'approved', 'import', now()),
 ('claude-opus-5', 'Claude Opus 5', 'Anthropic',
  'Anthropic''s previous flagship for demanding reasoning, coding and long running agentic work, succeeded by Opus 5.5.',
  'Claude', 'anthropic/claude-opus-5', 1000000, 128000, '{text,image,file}', '{text}',
  5, 25, 0.5, 6.25, 2.5, 12.5,
  'Cache writes held for 1 hour cost $10 per 1M tokens. Web search $0.01 per request.',
  'https://openrouter.ai/anthropic/claude-opus-5', now(), '{reasoning,coding,agents}', 'https://www.anthropic.com/claude', 'approved', 'import', now()),
 ('gpt-5-6-sol', 'GPT-5.6 Sol', 'OpenAI',
  'The flagship of OpenAI''s GPT-5.6 series, for complex reasoning, coding and agentic workflows.',
  'GPT-5.6', 'openai/gpt-5.6-sol', 1050000, 128000, '{text,image,file}', '{text}',
  2, 10, 0.2, 2.5, 1, 5,
  'Prompts over 272K tokens: $4 input, $15 output, $0.40 cache read per 1M. Web search $0.01 per request.',
  'https://openrouter.ai/openai/gpt-5.6-sol', now(), '{reasoning,coding}', 'https://openai.com', 'approved', 'import', now());
alter table public.models enable trigger models_submission_guard;

insert into public.compare_facts (model_id, attribute, value_flag, note, source_label, source_url, verified_at, source)
select m.id, f.attr, f.flag, f.note, 'OpenRouter model listing', m.pricing_source_url, now(), 'import'
from public.models m
cross join (values ('reasoning', true, 'Reasoning effort supported'), ('tool_calling', true, null),
  ('structured_outputs', true, null), ('vision', true, null), ('audio_input', false, null),
  ('video_input', false, null), ('deploy_api', true, null), ('batch_processing', true, null)) f(attr, flag, note)
where m.slug in ('claude-fable-5-1', 'claude-opus-5', 'gpt-5-6-sol');

insert into public.compare_facts (model_id, attribute, value_text, source_label, source_url, verified_at, source)
select m.id, 'supported_parameters', p, 'OpenRouter model listing', m.pricing_source_url, now(), 'import'
from public.models m
join (values
  ('claude-fable-5-1', '{include_reasoning,max_completion_tokens,max_tokens,reasoning,reasoning_effort,response_format,stop,structured_outputs,tool_choice,tools,verbosity}'::text[]),
  ('claude-opus-5', '{include_reasoning,max_completion_tokens,max_tokens,reasoning,reasoning_effort,response_format,stop,structured_outputs,temperature,tool_choice,tools,verbosity}'),
  ('gpt-5-6-sol', '{include_reasoning,max_completion_tokens,max_tokens,reasoning,reasoning_effort,response_format,seed,structured_outputs,tool_choice,tools}')
) s(slug, params) on s.slug = m.slug
cross join lateral unnest(s.params) p;

insert into public.compare_facts (model_id, attribute, value_text, source_label, source_url, verified_at, source)
select id, 'deploy_providers', 'OpenRouter', 'OpenRouter model listing', pricing_source_url, now(), 'import'
from public.models where slug in ('claude-fable-5-1', 'claude-opus-5', 'gpt-5-6-sol');

-- 4. The results. Copied from the table; "who ran it" follows the page's footnotes.
insert into public.model_evaluations (model_id, benchmark_slug, kind, domain, name, metric, score, unit,
  higher_is_better, model_version, evaluator, dataset_version, evaluated_at, note,
  source_label, source_url, verified_at, source)
select m.id, b.slug, 'benchmark', b.domain, b.name, v.metric, v.score, v.unit, true, m.name, v.evaluator,
  v.dsv, date '2026-09-22', v.note, 'Claude Opus 5.5 announcement', 'https://www.anthropic.com/claude-opus-5-5', now(), 'admin'
from (values
  -- Terminal-Bench 4.0: Claude figures by Anthropic, GPT figures as reported by OpenAI.
  ('claude-opus-5-5','terminal-bench','% of tasks',66.4,'percent','Anthropic','4.0','xhigh effort. Standard error about 2.6 points'),
  ('claude-fable-5-1','terminal-bench','% of tasks',55.8,'percent','Anthropic','4.0','Standard error about 1.6 to 2 points'),
  ('claude-opus-5','terminal-bench','% of tasks',52.3,'percent','Anthropic','4.0','Public leaderboard reports 51.8%, within noise'),
  ('gpt-6-astra','terminal-bench','% of tasks',57.9,'percent','OpenAI, as cited by Anthropic','4.0','High effort, as reported by OpenAI'),
  ('gpt-5-6-sol','terminal-bench','% of tasks',37.3,'percent','OpenAI, as cited by Anthropic','4.0','As reported by OpenAI'),
  -- FrontierCode v1.1 (Main)
  ('claude-opus-5-5','frontiercode','% merged',54.4,'percent','Published by Anthropic','v1.1 Main',null),
  ('claude-fable-5-1','frontiercode','% merged',50.3,'percent','Published by Anthropic','v1.1 Main',null),
  ('claude-opus-5','frontiercode','% merged',48.0,'percent','Published by Anthropic','v1.1 Main',null),
  ('gpt-6-astra','frontiercode','% merged',53.3,'percent','Published by Anthropic','v1.1 Main',null),
  ('gpt-5-6-sol','frontiercode','% merged',47.5,'percent','Published by Anthropic','v1.1 Main',null),
  -- CursorBench 4.0 (no GPT-6 Astra result published)
  ('claude-opus-5-5','cursorbench','% of tasks',57.8,'percent','Published by Anthropic','4.0',null),
  ('claude-fable-5-1','cursorbench','% of tasks',51.8,'percent','Published by Anthropic','4.0',null),
  ('claude-opus-5','cursorbench','% of tasks',46.6,'percent','Published by Anthropic','4.0',null),
  ('gpt-5-6-sol','cursorbench','% of tasks',41.7,'percent','Published by Anthropic','4.0',null),
  -- GDPval-AA v2.1, a rating
  ('claude-opus-5-5','gdpval-aa','Rating',1846,'rating','Published by Anthropic','v2.1',null),
  ('claude-fable-5-1','gdpval-aa','Rating',1735,'rating','Published by Anthropic','v2.1',null),
  ('claude-opus-5','gdpval-aa','Rating',1708,'rating','Published by Anthropic','v2.1',null),
  ('gpt-6-astra','gdpval-aa','Rating',1542,'rating','Published by Anthropic','v2.1',null),
  ('gpt-5-6-sol','gdpval-aa','Rating',1588,'rating','Published by Anthropic','v2.1',null),
  -- AutomationBench, run by Zapier
  ('claude-opus-5-5','automationbench','% of workflows',40.0,'percent','Zapier',null,'Run without fallback models; safeguard interventions counted as failures'),
  ('claude-fable-5-1','automationbench','% of workflows',31.4,'percent','Zapier',null,null),
  ('claude-opus-5','automationbench','% of workflows',26.9,'percent','Zapier',null,'From Zapier''s public leaderboard'),
  ('gpt-6-astra','automationbench','% of workflows',41.4,'percent','Zapier',null,'From Zapier''s public leaderboard'),
  ('gpt-5-6-sol','automationbench','% of workflows',28.8,'percent','Zapier',null,'From Zapier''s public leaderboard'),
  -- Humanity's Last Exam, with tools (no GPT-5.6 Sol result published)
  ('claude-opus-5-5','humanitys-last-exam','% correct',67.7,'percent','Published by Anthropic',null,'With tools'),
  ('claude-fable-5-1','humanitys-last-exam','% correct',65.6,'percent','Published by Anthropic',null,'With tools'),
  ('claude-opus-5','humanitys-last-exam','% correct',63.6,'percent','Published by Anthropic',null,'With tools'),
  ('gpt-6-astra','humanitys-last-exam','% correct',57.2,'percent','Published by Anthropic',null,'With tools'),
  -- Terminal-Bench-Science 0.1
  ('claude-opus-5-5','terminal-bench-science','% of tasks',58.7,'percent','Anthropic','0.1','Standard error about 3.5 to 5 points'),
  ('claude-fable-5-1','terminal-bench-science','% of tasks',52.6,'percent','Anthropic','0.1','Standard error about 3.5 to 5 points'),
  ('claude-opus-5','terminal-bench-science','% of tasks',29.0,'percent','Anthropic','0.1','Public leaderboard reports 30.0%, within noise'),
  ('gpt-6-astra','terminal-bench-science','% of tasks',64.6,'percent','OpenAI, as cited by Anthropic','0.1','As reported by OpenAI'),
  ('gpt-5-6-sol','terminal-bench-science','% of tasks',22.4,'percent','Published by Anthropic','0.1',null),
  -- OSWorld 2.0, partial (no GPT results published)
  ('claude-opus-5-5','osworld','% of tasks',81.8,'percent','Published by Anthropic','2.0','Marked partial by the source'),
  ('claude-fable-5-1','osworld','% of tasks',80.7,'percent','Published by Anthropic','2.0','Marked partial by the source'),
  ('claude-opus-5','osworld','% of tasks',74.0,'percent','Published by Anthropic','2.0','Marked partial by the source'),
  -- Chartography, with tools (no GPT results published)
  ('claude-opus-5-5','chartography','% correct',89.0,'percent','Published by Anthropic',null,'With tools'),
  ('claude-fable-5-1','chartography','% correct',88.4,'percent','Published by Anthropic',null,'With tools'),
  ('claude-opus-5','chartography','% correct',83.4,'percent','Published by Anthropic',null,'With tools')
) v(slug, bench, metric, score, unit, evaluator, dsv, note)
join public.models m on m.slug = v.slug and m.status = 'approved'
join public.benchmarks b on b.slug = v.bench;
