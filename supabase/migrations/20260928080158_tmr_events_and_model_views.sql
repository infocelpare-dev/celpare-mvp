-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260928080158. History: never edit.

-- 4BK, D184: the Tool & Model Recommendation Engine reuses recommendation_events.
alter table public.recommendation_events
  add column if not exists request_id uuid,
  add column if not exists strategy text;

alter table public.recommendation_events
  add constraint recommendation_events_strategy_check
  check (strategy is null or strategy in ('similar','alternative','personalized','contextual','fit','related'));

alter table public.recommendation_events drop constraint recommendation_events_event_check;
alter table public.recommendation_events
  add constraint recommendation_events_event_check
  check (event = any (array['impression','click','save','dismiss','follow','share','play','complete','compare_add','not_interested']));

create index if not exists recommendation_events_request_idx
  on public.recommendation_events (request_id) where request_id is not null;

-- explore_v1 reads only its own surface, so engine events on tool and model pages
-- cannot change its inputs. Every row before this migration is surface explore.
create or replace function public.my_explore_history(p_days integer default 30)
 returns table(entity_type text, entity_id uuid, entity_key text, event text, section text, at timestamp with time zone)
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select r.entity_type, r.entity_id, r.entity_key, r.event, r.section, r.created_at
    from public.recommendation_events r
   where r.user_id = (select auth.uid())
     and (select auth.uid()) is not null
     and r.surface = 'explore'
     and r.entity_type is not null
     and r.created_at > now() - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 90))
   order by r.created_at desc
   limit 1000;
$function$;

-- A model page open, the model twin of tool_view_events. Service role writes only.
create table if not exists public.model_view_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id),
  model_id uuid not null references public.models(id) on delete cascade,
  source text not null default 'direct'
    check (source = any (array['direct','search','explore','ask','recommendation','community','compare'])),
  query text check (query is null or char_length(query) <= 200),
  created_at timestamptz not null default now()
);
alter table public.model_view_events enable row level security;
revoke all on public.model_view_events from public, anon, authenticated;
create index if not exists model_view_events_model_idx on public.model_view_events (model_id, created_at desc);
create index if not exists model_view_events_user_idx on public.model_view_events (user_id, created_at desc);
create index if not exists model_view_events_created_idx on public.model_view_events (created_at desc);
