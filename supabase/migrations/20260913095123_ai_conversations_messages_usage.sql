-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260913095123. History: never edit.

-- Phase 4B part 2. Conversation state and the durable usage record.

-- Plan drives the AI limits. Deliberately NOT in the user's update grant, which
-- lists username, full_name, avatar_url, bio, is_developer and onboarded_at, so
-- a user cannot promote themselves to premium. Phase 7 moves the source of
-- truth to a subscriptions table and this column becomes derived.
alter table public.profiles
  add column if not exists plan text not null default 'free';
alter table public.profiles drop constraint if exists profiles_plan_valid;
alter table public.profiles
  add constraint profiles_plan_valid check (plan in ('free','pro','premium'));

grant select (plan) on public.profiles to anon, authenticated;

-- D36: anonymous chats are never persisted, so every row here has an owner.
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text check (title is null or char_length(title) <= 200),
  feature text not null default 'ask',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists conversations_user_idx
  on public.conversations (user_id, updated_at desc) where deleted_at is null;

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null check (char_length(content) <= 32000),
  model text,
  provider text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  -- Which tools the answer drew on, so the citation cards can be rebuilt on reload.
  citations jsonb not null default '[]'::jsonb,
  tool_calls jsonb not null default '[]'::jsonb,
  error jsonb,
  created_at timestamptz not null default now()
);

create index if not exists messages_conversation_idx
  on public.messages (conversation_id, created_at asc);

-- The durable billing and audit record. Redis holds the live counters and can
-- be lost; this cannot. Phase 7 bills from it.
create table if not exists public.ai_usage_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  -- Hash of the anon cookie id, the IP and a server salt. Never a raw IP:
  -- the project is hosted in eu-west-1 and G9 has no retention answer yet.
  anon_hash text,
  plan text not null,
  feature text not null,
  provider text not null,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cost_usd numeric(12,6) not null default 0,
  latency_ms integer,
  status text not null check (status in ('ok','refused_scope','rate_limited','filtered','error')),
  created_at timestamptz not null default now(),
  -- Either a user or an anon hash, never neither.
  constraint ai_usage_has_subject check (user_id is not null or anon_hash is not null)
);

create index if not exists ai_usage_user_idx on public.ai_usage_records (user_id, created_at desc);
create index if not exists ai_usage_anon_idx on public.ai_usage_records (anon_hash, created_at desc);

drop trigger if exists conversations_touch on public.conversations;
create trigger conversations_touch before update on public.conversations
  for each row execute function public.touch_updated_at();

alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.ai_usage_records enable row level security;

-- Conversations: strictly your own. No anon policy at all, so a signed out
-- visitor sees nothing here, which matches "chats are not saved".
drop policy if exists conversations_own on public.conversations;
create policy conversations_own on public.conversations
  for all to authenticated
  using (auth.uid() = user_id and deleted_at is null)
  with check (auth.uid() = user_id);

drop policy if exists messages_own on public.messages;
create policy messages_own on public.messages
  for all to authenticated
  using (exists (
    select 1 from public.conversations c
    where c.id = conversation_id and c.user_id = auth.uid() and c.deleted_at is null
  ))
  with check (exists (
    select 1 from public.conversations c
    where c.id = conversation_id and c.user_id = auth.uid() and c.deleted_at is null
  ));

-- Usage: readable by the owner, writable by nobody holding a publishable key.
-- Without an insert policy, a forged row cannot be posted to the REST API with
-- the public anon key. The gateway writes these server side with the service
-- role, which never sees user supplied values: every number in the row is
-- computed by our own code.
drop policy if exists ai_usage_select_own on public.ai_usage_records;
create policy ai_usage_select_own on public.ai_usage_records
  for select to authenticated using (auth.uid() = user_id);
