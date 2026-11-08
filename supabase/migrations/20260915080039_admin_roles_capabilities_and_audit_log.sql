-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260915080039. History: never edit.

-- Admin foundation: staff roles, a capability matrix, account status, and the
-- append only audit log every sensitive admin action writes to.
--
-- The existing role architecture is extended rather than replaced. profiles.role
-- already carried user / moderator / admin / super_admin and is already absent
-- from the client UPDATE grant, so a person cannot promote themselves. Three
-- more staff roles join it here.

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('user', 'support', 'moderator', 'dev_ops', 'ai_ops', 'admin', 'super_admin'));

-- Account status. Suspension is an admin act, so like role and plan these
-- columns are never in a client grant.
alter table public.profiles
  add column if not exists account_status text not null default 'active',
  add column if not exists status_reason text,
  add column if not exists status_changed_at timestamptz,
  add column if not exists suspended_until timestamptz;

alter table public.profiles drop constraint if exists profiles_account_status_check;
alter table public.profiles add constraint profiles_account_status_check
  check (account_status in ('active', 'suspended', 'disabled', 'deleted'));

alter table public.profiles drop constraint if exists profiles_status_reason_check;
alter table public.profiles add constraint profiles_status_reason_check
  check (status_reason is null or char_length(status_reason) <= 500);

comment on column public.profiles.account_status is
  'Admin controlled. Absent from every client grant, the same rule as role and plan.';

-- The four new columns inherit nothing from the old grants, but say so out loud
-- rather than trusting that. Revoke before you grant, every time.
revoke update (account_status, status_reason, status_changed_at, suspended_until)
  on public.profiles from anon, authenticated;

-- Staff need to see who is suspended when rendering the moderation surfaces,
-- and the status of an account is not private the way an email address is.
grant select (account_status, status_reason, status_changed_at, suspended_until)
  on public.profiles to authenticated;


/* ------------------------------------------------------------- capabilities */

-- The capability matrix. This is the authorization, and it lives in SQL because
-- SQL is what the RPCs read. The TypeScript copy in src/lib/admin/capabilities.ts
-- decides what to RENDER and grants nothing, exactly the way is_developer does.
create table if not exists public.admin_capabilities (
  role       text not null,
  capability text not null,
  primary key (role, capability)
);

alter table public.admin_capabilities enable row level security;
revoke all on public.admin_capabilities from anon, authenticated;

insert into public.admin_capabilities (role, capability) values
  -- Support: read users, read reports, read the analytics everyone sees.
  ('support', 'admin.access'), ('support', 'users.read'),
  ('support', 'reports.read'), ('support', 'analytics.read'),

  -- Moderator: the community, its reports, and the user level consequences.
  ('moderator', 'admin.access'), ('moderator', 'users.read'),
  ('moderator', 'users.moderate'), ('moderator', 'content.moderate'),
  ('moderator', 'reports.read'), ('moderator', 'analytics.read'),

  -- Developer operations: the catalogue and the people who fill it.
  ('dev_ops', 'admin.access'), ('dev_ops', 'submissions.review'),
  ('dev_ops', 'developers.manage'), ('dev_ops', 'models.manage'),
  ('dev_ops', 'reports.read'), ('dev_ops', 'analytics.read'),

  -- AI operations: spend and infrastructure visibility, no configuration.
  ('ai_ops', 'admin.access'), ('ai_ops', 'ai.read'),
  ('ai_ops', 'jobs.read'), ('ai_ops', 'analytics.read'),

  -- Admin: everything except changing roles and reconfiguring the gateway.
  ('admin', 'admin.access'), ('admin', 'users.read'), ('admin', 'users.moderate'),
  ('admin', 'users.plan'), ('admin', 'content.moderate'), ('admin', 'reports.read'),
  ('admin', 'submissions.review'), ('admin', 'developers.manage'),
  ('admin', 'models.manage'), ('admin', 'ai.read'), ('admin', 'analytics.read'),
  ('admin', 'billing.read'), ('admin', 'security.read'), ('admin', 'audit.read'),
  ('admin', 'settings.manage'), ('admin', 'jobs.read'),

  -- Super admin: the above, plus the two that can hand out power or change what
  -- the platform runs on.
  ('super_admin', 'admin.access'), ('super_admin', 'users.read'),
  ('super_admin', 'users.moderate'), ('super_admin', 'users.plan'),
  ('super_admin', 'users.role'), ('super_admin', 'content.moderate'),
  ('super_admin', 'reports.read'), ('super_admin', 'submissions.review'),
  ('super_admin', 'developers.manage'), ('super_admin', 'models.manage'),
  ('super_admin', 'ai.read'), ('super_admin', 'ai.configure'),
  ('super_admin', 'analytics.read'), ('super_admin', 'billing.read'),
  ('super_admin', 'security.read'), ('super_admin', 'audit.read'),
  ('super_admin', 'settings.manage'), ('super_admin', 'jobs.read')
on conflict do nothing;


-- Fails closed: no session, no row, unknown role, or a suspended staff account
-- all return false. A suspended admin is not an admin.
create or replace function public.has_admin_capability(p_capability text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.profiles p
    join public.admin_capabilities c on c.role = p.role
    where p.id = (select auth.uid())
      and p.account_status = 'active'
      and c.capability = p_capability
  );
$$;

create or replace function public.my_admin_role()
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  select p.role
  from public.profiles p
  where p.id = (select auth.uid())
    and p.account_status = 'active'
    and p.role <> 'user';
$$;

-- Kept as its own function rather than folded into has_admin_capability, because
-- the existing moderation RPCs and several RLS policies already call it and
-- changing what they gate on is not this migration's job.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.account_status = 'active'
      and p.role in ('admin', 'super_admin')
  );
$$;

revoke execute on function public.has_admin_capability(text) from public;
revoke execute on function public.my_admin_role() from public;
revoke execute on function public.is_admin() from public;
grant execute on function public.has_admin_capability(text) to authenticated;
grant execute on function public.my_admin_role() to authenticated;
grant execute on function public.is_admin() to authenticated;


/* --------------------------------------------------------------- audit log */

create table if not exists public.admin_audit_log (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid references public.profiles(id),
  actor_role   text,
  action       text not null,
  entity_type  text not null,
  entity_id    text,
  entity_label text,
  reason       text check (reason is null or char_length(reason) <= 1000),
  -- Previous and new state, so an entry says what actually changed and not just
  -- that something did.
  before_state jsonb not null default '{}'::jsonb,
  after_state  jsonb not null default '{}'::jsonb,
  -- Request metadata is recorded only where it is operationally necessary to
  -- attribute an action, and never for ordinary reads. No user agent string, no
  -- device fingerprint.
  ip           inet,
  created_at   timestamptz not null default now()
);

create index if not exists admin_audit_log_created_idx on public.admin_audit_log (created_at desc);
create index if not exists admin_audit_log_actor_idx   on public.admin_audit_log (actor_id, created_at desc);
create index if not exists admin_audit_log_entity_idx  on public.admin_audit_log (entity_type, entity_id, created_at desc);
create index if not exists admin_audit_log_action_idx  on public.admin_audit_log (action, created_at desc);

alter table public.admin_audit_log enable row level security;
revoke all on public.admin_audit_log from anon, authenticated;

-- Immutable, and enforced rather than promised. Nothing rewrites history: not a
-- client, not an admin, not a future migration that forgets. Dropping the
-- trigger is itself a schema change and therefore visible.
create or replace function public.tg_audit_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'admin_audit_log is append only' using errcode = '42501';
end;
$$;

drop trigger if exists admin_audit_log_immutable on public.admin_audit_log;
create trigger admin_audit_log_immutable
  before update or delete on public.admin_audit_log
  for each row execute function public.tg_audit_append_only();

-- The one way an entry is written. Private to the admin RPCs: it is not granted
-- to any client role, so an audit entry cannot be forged from the outside.
create or replace function public.admin_audit(
  p_action       text,
  p_entity_type  text,
  p_entity_id    text,
  p_entity_label text default null,
  p_reason       text default null,
  p_before       jsonb default '{}'::jsonb,
  p_after        jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_ip inet;
begin
  -- Best effort. The header is absent outside PostgREST, which is fine: an
  -- entry with no IP is still a complete record of who did what to whom.
  begin
    v_ip := nullif(split_part(
      current_setting('request.headers', true)::json->>'x-forwarded-for', ',', 1), '')::inet;
  exception when others then
    v_ip := null;
  end;

  insert into public.admin_audit_log
    (actor_id, actor_role, action, entity_type, entity_id, entity_label,
     reason, before_state, after_state, ip)
  values
    ((select auth.uid()), public.my_admin_role(), p_action, p_entity_type,
     p_entity_id, p_entity_label, nullif(btrim(coalesce(p_reason, '')), ''),
     coalesce(p_before, '{}'::jsonb), coalesce(p_after, '{}'::jsonb), v_ip);
end;
$$;

revoke execute on function public.admin_audit(text, text, text, text, text, jsonb, jsonb) from public, anon, authenticated;
