-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260923090217. History: never edit.

-- Real data for Compare, checked 2026-09-23.
-- Models: from the OpenRouter models API (https://openrouter.ai/api/v1/models), one
-- source URL per model. Tools: from each vendor's own pricing page.
-- Nothing here is estimated. Where a page did not state something, it is not recorded.

-- 0. Retire the invented test evidence on models, so it never sits beside real rows.
delete from public.model_evaluations where source = 'test-fixture';
delete from public.compare_facts where source = 'test-fixture' and model_id is not null;
update public.models set cached_input_price_per_m = null, pricing_source_url = null,
  pricing_verified_at = null, pricing_note = null, family = null, max_output_tokens = null
where slug = 'claude-sonnet-4-5' and 'test-fixture' = any(tags);

-- 1. Register the one attribute the registry lacked.
insert into public.compare_attributes (key, section, applies_to, value_type, label, sort_order)
values ('supported_parameters', 'technical', '{model}', 'list', 'Supported API parameters', 90);

-- 2. The models. The submission guard forces every insert to draft, which is right
-- for developers and wrong for a curated import, so it is paused for this statement.
alter table public.models disable trigger models_submission_guard;

insert into public.models (slug, name, provider, description, family, api_model_id, context_window,
  max_output_tokens, modalities, output_modalities, input_price_per_m, output_price_per_m,
  cached_input_price_per_m, cache_write_price_per_m, batch_input_price_per_m, batch_output_price_per_m,
  pricing_note, pricing_source_url, pricing_verified_at, open_weights, tags, website_url,
  status, source, submitted_at)
values
 ('claude-opus-5-5', 'Claude Opus 5.5', 'Anthropic',
  'Anthropic''s flagship model for demanding reasoning, coding and long running agentic work. Succeeds Claude Opus 5.',
  'Claude', 'anthropic/claude-opus-5.5', 1000000, 128000, '{text,image,file}', '{text}',
  4, 20, 0.2, 5, 2, 10,
  'Cache writes held for 1 hour cost $8 per 1M tokens. Web search $0.01 per request.',
  'https://openrouter.ai/anthropic/claude-opus-5.5', now(), null, '{reasoning,coding,agents}', 'https://www.anthropic.com/claude',
  'approved', 'import', now()),
 ('claude-sonnet-5', 'Claude Sonnet 5', 'Anthropic',
  'Anthropic''s most capable Sonnet class model, for coding, agents and professional work, with selectable reasoning effort.',
  'Claude', 'anthropic/claude-sonnet-5', 1000000, 128000, '{text,image,file}', '{text}',
  2, 10, 0.2, 2.5, 1, 5,
  'Cache writes held for 1 hour cost $4 per 1M tokens. Web search $0.01 per request.',
  'https://openrouter.ai/anthropic/claude-sonnet-5', now(), null, '{reasoning,coding,agents}', 'https://www.anthropic.com/claude',
  'approved', 'import', now()),
 ('gpt-6-sol', 'GPT-6 Sol', 'OpenAI',
  'The cost efficient high end model in OpenAI''s GPT-6 series, between the flagship Astra and the fast Luna tier.',
  'GPT-6', 'openai/gpt-6-sol', 1050000, 128000, '{text,image,file}', '{text}',
  2, 10, 0.2, 2.5, 1, 5,
  'Prompts over 272K tokens: $4 input, $15 output, $0.40 cache read per 1M. Web search $0.01 per request.',
  'https://openrouter.ai/openai/gpt-6-sol', now(), null, '{reasoning,coding}', 'https://openai.com',
  'approved', 'import', now()),
 ('gpt-6-astra', 'GPT-6 Astra', 'OpenAI',
  'OpenAI''s flagship GPT-6 model for demanding end to end work: analysis, software engineering, deep research and documents.',
  'GPT-6', 'openai/gpt-6-astra', 1050000, 128000, '{text,image,file}', '{text}',
  10, 50, 1, 12.5, 5, 25,
  'Prompts over 272K tokens: $20 input, $75 output, $2 cache read per 1M. Web search $0.01 per request.',
  'https://openrouter.ai/openai/gpt-6-astra', now(), null, '{reasoning,coding,research}', 'https://openai.com',
  'approved', 'import', now()),
 ('gemini-3-8-flash', 'Gemini 3.8 Flash', 'Google',
  'Google''s most capable Flash model, improved over 3.7 Flash in software engineering, agentic tasks and multi step reasoning.',
  'Gemini', 'google/gemini-3.8-flash', 1048576, 65536, '{text,image,video,file,audio}', '{text}',
  0.75, 3.75, 0.075, null, 0.375, 1.875,
  'Audio and image input $0.75 per 1M. Web search $0.014 per request.',
  'https://openrouter.ai/google/gemini-3.8-flash', now(), null, '{multimodal,long-context}', 'https://deepmind.google/models/gemini/',
  'approved', 'import', now()),
 ('deepseek-v4-1-flash', 'DeepSeek V4.1 Flash', 'DeepSeek',
  'A sparse mixture of experts model from DeepSeek, the first on its Causal Encoder Decoder architecture. Weights published on Hugging Face.',
  'DeepSeek V4', 'deepseek/deepseek-v4.1-flash', 1048576, 943718, '{text,image}', '{text}',
  0.1, 0.5, 0.01, null, 0.112, 0.336,
  'Batch input is listed higher than standard input on OpenRouter ($0.112 vs $0.10 per 1M).',
  'https://openrouter.ai/deepseek/deepseek-v4.1-flash', now(), true, '{open-weights,budget}', 'https://www.deepseek.com',
  'approved', 'import', now()),
 ('grok-4-7', 'Grok 4.7', 'SpaceXAI',
  'SpaceXAI''s flagship model for coding, agentic tasks and knowledge work. Succeeds Grok 4.6.',
  'Grok 4', 'x-ai/grok-4.7', 500000, 450000, '{text,image,file}', '{text}',
  1.6, 4.8, 0.4, null, null, null,
  'Prompts over 200K tokens: $3.20 input, $9.60 output, $0.80 cache read per 1M. Web search $0.005 per request.',
  'https://openrouter.ai/x-ai/grok-4.7', now(), null, '{reasoning,coding}', 'https://x.ai',
  'approved', 'import', now());

alter table public.models enable trigger models_submission_guard;

-- 3. Model capabilities, read from each model's modalities and supported parameters on OpenRouter.
insert into public.compare_facts (model_id, attribute, value_flag, value_text, note, source_label, source_url, verified_at, source)
select m.id, f.attr, f.flag, f.txt, f.note, 'OpenRouter model listing', m.pricing_source_url, now(), 'import'
from public.models m
join (values
  ('claude-opus-5-5','reasoning',true,null,'Reasoning effort supported'),
  ('claude-opus-5-5','tool_calling',true,null,null),
  ('claude-opus-5-5','structured_outputs',true,null,null),
  ('claude-opus-5-5','vision',true,null,null),
  ('claude-opus-5-5','audio_input',false,null,null),
  ('claude-opus-5-5','video_input',false,null,null),
  ('claude-sonnet-5','reasoning',true,null,'Reasoning effort supported'),
  ('claude-sonnet-5','tool_calling',true,null,null),
  ('claude-sonnet-5','structured_outputs',true,null,null),
  ('claude-sonnet-5','vision',true,null,null),
  ('claude-sonnet-5','audio_input',false,null,null),
  ('claude-sonnet-5','video_input',false,null,null),
  ('gpt-6-sol','reasoning',true,null,'Reasoning effort supported'),
  ('gpt-6-sol','tool_calling',true,null,null),
  ('gpt-6-sol','structured_outputs',true,null,null),
  ('gpt-6-sol','vision',true,null,null),
  ('gpt-6-sol','audio_input',false,null,null),
  ('gpt-6-sol','video_input',false,null,null),
  ('gpt-6-astra','reasoning',true,null,'Reasoning effort supported'),
  ('gpt-6-astra','tool_calling',true,null,null),
  ('gpt-6-astra','structured_outputs',true,null,null),
  ('gpt-6-astra','vision',true,null,null),
  ('gpt-6-astra','audio_input',false,null,null),
  ('gpt-6-astra','video_input',false,null,null),
  ('gemini-3-8-flash','reasoning',true,null,'Reasoning effort supported'),
  ('gemini-3-8-flash','tool_calling',true,null,null),
  ('gemini-3-8-flash','structured_outputs',true,null,null),
  ('gemini-3-8-flash','vision',true,null,null),
  ('gemini-3-8-flash','audio_input',true,null,null),
  ('gemini-3-8-flash','video_input',true,null,null),
  ('deepseek-v4-1-flash','reasoning',true,null,'Reasoning effort supported'),
  ('deepseek-v4-1-flash','tool_calling',true,null,null),
  ('deepseek-v4-1-flash','structured_outputs',true,null,null),
  ('deepseek-v4-1-flash','vision',true,null,null),
  ('deepseek-v4-1-flash','audio_input',false,null,null),
  ('deepseek-v4-1-flash','video_input',false,null,null),
  ('grok-4-7','reasoning',true,null,'Reasoning effort supported'),
  ('grok-4-7','tool_calling',true,null,null),
  ('grok-4-7','structured_outputs',true,null,null),
  ('grok-4-7','vision',true,null,null),
  ('grok-4-7','audio_input',false,null,null),
  ('grok-4-7','video_input',false,null,null),
  ('claude-opus-5-5','deploy_api',true,null,null),
  ('claude-sonnet-5','deploy_api',true,null,null),
  ('gpt-6-sol','deploy_api',true,null,null),
  ('gpt-6-astra','deploy_api',true,null,null),
  ('gemini-3-8-flash','deploy_api',true,null,null),
  ('deepseek-v4-1-flash','deploy_api',true,null,null),
  ('grok-4-7','deploy_api',true,null,null),
  ('claude-opus-5-5','batch_processing',true,null,null),
  ('claude-sonnet-5','batch_processing',true,null,null),
  ('gpt-6-sol','batch_processing',true,null,null),
  ('gpt-6-astra','batch_processing',true,null,null),
  ('gemini-3-8-flash','batch_processing',true,null,null),
  ('deepseek-v4-1-flash','batch_processing',true,null,null)
) f(slug, attr, flag, txt, note) on f.slug = m.slug
where m.source = 'import';

-- Open weights for DeepSeek, sourced to the published weights rather than the listing.
update public.models set open_weights = true where slug = 'deepseek-v4-1-flash';

-- Supported parameters, one row each, exactly as OpenRouter lists them.
insert into public.compare_facts (model_id, attribute, value_text, source_label, source_url, verified_at, source)
select m.id, 'supported_parameters', p, 'OpenRouter model listing', m.pricing_source_url, now(), 'import'
from public.models m
join (values
  ('claude-opus-5-5', '{include_reasoning,max_completion_tokens,max_tokens,reasoning,reasoning_effort,response_format,stop,structured_outputs,temperature,tool_choice,tools,verbosity}'::text[]),
  ('claude-sonnet-5', '{include_reasoning,max_completion_tokens,max_tokens,reasoning,reasoning_effort,response_format,stop,structured_outputs,tool_choice,tools,verbosity}'),
  ('gpt-6-sol', '{include_reasoning,max_completion_tokens,max_tokens,reasoning,reasoning_effort,response_format,seed,structured_outputs,tool_choice,tools}'),
  ('gpt-6-astra', '{include_reasoning,max_completion_tokens,max_tokens,reasoning,reasoning_effort,response_format,seed,structured_outputs,tool_choice,tools}'),
  ('gemini-3-8-flash', '{include_reasoning,max_tokens,reasoning,reasoning_effort,response_format,seed,stop,structured_outputs,temperature,tool_choice,tools,top_p}'),
  ('deepseek-v4-1-flash', '{frequency_penalty,include_reasoning,logit_bias,logprobs,max_tokens,min_p,presence_penalty,reasoning,reasoning_effort,repetition_penalty,response_format,seed,stop,structured_outputs,temperature,tool_choice,tools,top_k,top_logprobs,top_p}'),
  ('grok-4-7', '{include_reasoning,logprobs,max_tokens,reasoning,reasoning_effort,response_format,seed,structured_outputs,temperature,tool_choice,tools,top_logprobs,top_p}')
) s(slug, params) on s.slug = m.slug
cross join lateral unnest(s.params) p
where m.source = 'import';

insert into public.compare_facts (model_id, attribute, value_text, source_label, source_url, verified_at, source)
select id, 'deploy_providers', 'OpenRouter', 'OpenRouter model listing', pricing_source_url, now(), 'import'
from public.models where source = 'import';

-- 4. Tools: Claude, Gemini, Cursor. Plans exactly as each pricing page states them.
insert into public.tool_plans (tool_id, name, tier, price_amount, annual_price_amount, currency, billing_period,
  per_seat, limits, sort_order, source_label, source_url, verified_at, source)
select t.id, p.name, p.tier, p.price, p.annual, p.cur, p.period, p.seat, p.limits, p.ord, p.label, p.url, now(), 'admin'
from public.tools t
join (values
  ('claude','Free','free',0::numeric,null::numeric,null,null,false,'Chat on web, desktop and mobile. Web search, file creation and code execution. Memory, connectors, Artifacts.',0,'Claude pricing page','https://claude.com/pricing'),
  ('claude','Pro','individual',20,200,'USD','month',false,'More usage than Free. Claude Code, Projects, more models, task scheduling. $17 a month when billed annually.',1,'Claude pricing page','https://claude.com/pricing'),
  ('claude','Max','individual',100,null,'USD','month',false,'From $100 a month. 5x or 20x more usage than Pro, higher output limits, priority access. The page lists both tiers from $100.',2,'Claude pricing page','https://claude.com/pricing'),
  ('claude','Team, standard seat','team',25,240,'USD','month',true,'2 to 150 seats. $20 a seat a month billed annually. SSO, central billing, Claude Code, Microsoft 365 integration.',3,'Claude pricing page','https://claude.com/pricing'),
  ('claude','Team, premium seat','team',125,1200,'USD','month',true,'5x more usage than a standard seat. $100 a seat a month billed annually.',4,'Claude pricing page','https://claude.com/pricing'),
  ('gemini','Free','free',0,null,null,null,false,'Access to Gemini 3.6 Flash and varying access to 3.1 Pro. Deep Research, Gemini Live, Canvas. 15 GB storage.',0,'Google AI plans page','https://gemini.google/subscriptions/'),
  ('gemini','Google AI Plus','individual',4.99,null,'USD','month',false,'2x the usage limits of Free. Video generation, 200 Flow credits, 400 GB storage.',1,'Google AI plans page','https://gemini.google/subscriptions/'),
  ('gemini','Google AI Pro','individual',19.99,null,'USD','month',false,'4x the usage limits of Free. Gemini in Gmail, Docs and Vids, 1,000 Flow credits, coding agent, 5 TB storage.',2,'Google AI plans page','https://gemini.google/subscriptions/'),
  ('gemini','Google AI Ultra','individual',99.99,null,'USD','month',false,'From $99.99 for 5x Pro limits, $199.99 for 20x. 10,000 or 25,000 Flow credits, 20 TB storage and up.',3,'Google AI plans page','https://gemini.google/subscriptions/'),
  ('cursor','Hobby','free',0,null,null,null,false,'Limited Agent requests and access to Composer. No credit card required.',0,'Cursor pricing page','https://cursor.com/pricing'),
  ('cursor','Individual','individual',20,null,'USD','month',false,'From $20 a month across Pro, Pro+ and Ultra. Extended Agent limits, frontier models, cloud agents, MCPs, skills and hooks.',1,'Cursor pricing page','https://cursor.com/pricing'),
  ('cursor','Teams','team',40,null,'USD','month',true,'From $40 a user a month. Central billing and admin, Bugbot code review, usage analytics, team wide privacy mode, SAML and OIDC SSO.',2,'Cursor pricing page','https://cursor.com/pricing'),
  ('cursor','Enterprise','enterprise',null,null,null,'custom',false,'Custom pricing. Pooled usage, invoice billing, SCIM, access controls, audit logs, priority support.',3,'Cursor pricing page','https://cursor.com/pricing')
) p(slug,name,tier,price,annual,cur,period,seat,limits,ord,label,url) on p.slug = t.slug
where t.status = 'approved';

insert into public.compare_facts (tool_id, attribute, value_flag, value_text, note, source_label, source_url, verified_at, source)
select t.id, f.attr, f.flag, f.txt, f.note, f.label, f.url, now(), 'admin'
from public.tools t
join (values
  ('claude','text_generation',true,null,null,'Claude pricing page','https://claude.com/pricing'),
  ('claude','web_search',true,null,'On every plan, Free included','Claude pricing page','https://claude.com/pricing'),
  ('claude','file_analysis',true,null,null,'Claude pricing page','https://claude.com/pricing'),
  ('claude','code_generation',true,null,'Code execution on Free, Claude Code from Pro','Claude pricing page','https://claude.com/pricing'),
  ('claude','agents',true,null,'Claude Code and Cowork','Claude pricing page','https://claude.com/pricing'),
  ('claude','automation',true,null,'Task scheduling from Pro','Claude pricing page','https://claude.com/pricing'),
  ('claude','collaboration',true,null,'Team plan with central billing','Claude pricing page','https://claude.com/pricing'),
  ('claude','integration_microsoft',true,null,'Microsoft 365 extension from Pro','Claude pricing page','https://claude.com/pricing'),
  ('claude','enterprise_controls',true,null,'SSO on Team','Claude pricing page','https://claude.com/pricing'),
  ('claude','trains_on_user_data',null,'Not by default on Team plans',null,'Claude pricing page','https://claude.com/pricing'),
  ('gemini','text_generation',true,null,null,'Google AI plans page','https://gemini.google/subscriptions/'),
  ('gemini','image_generation',true,null,'On Free','Google AI plans page','https://gemini.google/subscriptions/'),
  ('gemini','video_generation',true,null,'From Google AI Plus','Google AI plans page','https://gemini.google/subscriptions/'),
  ('gemini','web_search',true,null,'Deep Research, on Free','Google AI plans page','https://gemini.google/subscriptions/'),
  ('gemini','agents',true,null,'Agentic capabilities and a coding agent, higher limits from Pro','Google AI plans page','https://gemini.google/subscriptions/'),
  ('gemini','audio_generation',true,null,'Gemini Live voice, on Free','Google AI plans page','https://gemini.google/subscriptions/'),
  ('gemini','integration_google',true,null,'Gemini in Gmail, Docs and Vids from Pro','Google AI plans page','https://gemini.google/subscriptions/'),
  ('cursor','code_generation',true,null,null,'Cursor pricing page','https://cursor.com/pricing'),
  ('cursor','agents',true,null,'Agent and cloud agents','Cursor pricing page','https://cursor.com/pricing'),
  ('cursor','collaboration',true,null,'Teams plan, shared context for cloud agents','Cursor pricing page','https://cursor.com/pricing'),
  ('cursor','enterprise_controls',true,null,'SSO on Teams, SCIM and audit logs on Enterprise','Cursor pricing page','https://cursor.com/pricing'),
  ('cursor','trains_on_user_data',null,'Not with privacy mode on','Privacy mode: code is not used for training by Cursor or its model providers','Cursor pricing page','https://cursor.com/pricing'),
  ('cursor','certifications',null,'SOC 2',null,'Cursor pricing page','https://cursor.com/pricing'),
  ('cursor','certifications',null,'ISO 27001',null,'Cursor pricing page','https://cursor.com/pricing'),
  ('cursor','certifications',null,'ISO 42001',null,'Cursor pricing page','https://cursor.com/pricing'),
  ('cursor','certifications',null,'AIUC-1',null,'Cursor pricing page','https://cursor.com/pricing')
) f(slug,attr,flag,txt,note,label,url) on f.slug = t.slug
where t.status = 'approved';
