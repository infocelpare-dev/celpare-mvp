-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260916142634. History: never edit.

-- Owner verification by business email, confirmed by a human.
--
-- There is no automated verification mail: Celpare has no email provider and
-- no sending domain (D26). The founder's decision is that the developer gives
-- a business email on the tool's own domain, a reviewer contacts it by hand,
-- and approval is what records the confirmation. So the database's job here is
-- narrow and worth stating: prove the email is ON the domain, keep the address
-- out of public reach, and make approval impossible until a human has said the
-- owner replied.

-- ---------------------------------------------------------------- normalizing

create or replace function public.normalize_domain(p_url text)
returns text
language sql
immutable
set search_path to 'public'
as $$
  select nullif(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(lower(btrim(coalesce(p_url, ''))), '^[a-z]+://', ''),
          '[/?#].*$', ''),
        ':[0-9]+$', ''),
      '^www\.', ''),
    '');
$$;

comment on function public.normalize_domain(text) is
  'https://WWW.Example.com/pricing?x=1 becomes example.com. Protocol, path, query, port and a leading www. all removed, lowercased. One definition, so the submitted URL and the submitted email are compared the same way.';

create or replace function public.email_domain(p_email text)
returns text
language sql
immutable
set search_path to 'public'
as $$
  select nullif(lower(btrim(split_part(coalesce(p_email, ''), '@', 2))), '');
$$;

-- A Gmail address proves you have a Gmail address. It does not prove you speak
-- for a company, which is the whole point of asking. Kept as a list in code
-- rather than a table: it changes rarely and a table would need its own grants,
-- its own policy and its own admin surface to be worth having.
create or replace function public.is_free_email_domain(p_domain text)
returns boolean
language sql
immutable
set search_path to 'public'
as $$
  select coalesce(lower(btrim(p_domain)), '') = any (array[
    'gmail.com','googlemail.com','yahoo.com','yahoo.co.uk','yahoo.co.in',
    'hotmail.com','hotmail.co.uk','outlook.com','live.com','msn.com',
    'aol.com','icloud.com','me.com','mac.com','proton.me','protonmail.com',
    'pm.me','gmx.com','gmx.net','gmx.de','mail.com','mail.ru','yandex.com',
    'yandex.ru','zoho.com','tutanota.com','tuta.io','fastmail.com','hey.com',
    'qq.com','163.com','126.com','sina.com','naver.com','daum.net',
    'web.de','t-online.de','free.fr','orange.fr','libero.it','rediffmail.com'
  ]);
$$;

-- ------------------------------------------------------------------- columns

alter table public.tools
  add column if not exists owner_email text,
  add column if not exists canonical_domain text,
  add column if not exists domain_verified_at timestamptz,
  add column if not exists domain_verified_by uuid references auth.users(id) on delete set null,
  add column if not exists domain_verified_note text;

comment on column public.tools.owner_email is
  'A business address on the tool''s own domain. Never granted to anon, and never granted to authenticated either: it is readable only through tool_verification_state(), which checks ownership or the review capability first.';
comment on column public.tools.canonical_domain is
  'Derived from website_url by tools_domain. Never client writable.';
comment on column public.tools.domain_verified_at is
  'Set only by admin_confirm_tool_domain, which is what a reviewer presses after the address replied. Cleared automatically if the domain or the address changes.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tools_owner_email_shape') then
    alter table public.tools add constraint tools_owner_email_shape
      check (owner_email is null or (char_length(owner_email) <= 254 and owner_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'));
  end if;
  -- Verified means verified BY somebody. The two columns move together or the
  -- record cannot say who decided.
  if not exists (select 1 from pg_constraint where conname = 'tools_domain_verified_pair') then
    alter table public.tools add constraint tools_domain_verified_pair
      check ((domain_verified_at is null) = (domain_verified_by is null));
  end if;
end $$;

create index if not exists tools_canonical_domain_idx on public.tools (canonical_domain)
  where canonical_domain is not null;

-- --------------------------------------------------------- the domain trigger

-- Runs for EVERY role, unlike tg_submission_guard, because a derived column
-- that is only correct when a developer writes it is not a derived column.
create or replace function public.tg_tool_domain()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_email_domain text;
begin
  new.canonical_domain := public.normalize_domain(new.website_url);
  new.owner_email := nullif(lower(btrim(coalesce(new.owner_email, ''))), '');

  if new.owner_email is not null then
    v_email_domain := public.email_domain(new.owner_email);

    if v_email_domain is null then
      raise exception 'owner_email_invalid' using errcode = '22023';
    end if;

    if public.is_free_email_domain(v_email_domain) then
      raise exception 'owner_email_free_provider' using errcode = '22023';
    end if;

    if new.canonical_domain is null then
      raise exception 'owner_email_needs_website' using errcode = '22023';
    end if;

    -- The one rule the whole feature rests on. A subdomain of the tool's own
    -- domain passes, because mail.example.com is still example.com's mail.
    if v_email_domain <> new.canonical_domain
       and v_email_domain not like ('%.' || new.canonical_domain) then
      raise exception 'owner_email_domain_mismatch' using errcode = '22023';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists tools_domain on public.tools;
create trigger tools_domain
  before insert or update on public.tools
  for each row execute function public.tg_tool_domain();

-- -------------------------------------------------- the client write guard

-- Unchanged in intent, extended in reach: the verification record joins the
-- list of things a client cannot write, and changing the domain or the address
-- throws away the proof that used to match them.
create or replace function public.tg_submission_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if tg_op = 'INSERT' then
    -- A client submission is always a draft owned by the caller, whatever the
    -- defaults happen to be on the day.
    new.developer_id := (select auth.uid());
    new.status       := 'draft';
    new.source       := 'developer_submission';
    new.submitted_at := now();
    new.verified     := false;
    new.domain_verified_at   := null;
    new.domain_verified_by   := null;
    new.domain_verified_note := null;
    return new;
  end if;

  -- On update, the moderation fields are carried over from the old row. A
  -- developer editing their tool cannot move it between states, cannot verify
  -- it, and cannot hand it to somebody else.
  new.status       := old.status;
  new.verified     := old.verified;
  new.developer_id := old.developer_id;
  new.source       := old.source;
  new.submitted_at := old.submitted_at;
  new.published_at := old.published_at;

  -- Verification is a statement about one address on one domain. Change either
  -- and the statement no longer describes what is in the row, so it goes.
  if new.canonical_domain is distinct from old.canonical_domain
     or new.owner_email is distinct from old.owner_email then
    new.domain_verified_at   := null;
    new.domain_verified_by   := null;
    new.domain_verified_note := null;
  else
    new.domain_verified_at   := old.domain_verified_at;
    new.domain_verified_by   := old.domain_verified_by;
    new.domain_verified_note := old.domain_verified_note;
  end if;

  return new;
end;
$$;

-- ------------------------------------------------------------------- grants

-- Revoke before grant, every time. owner_email is writable by its owner and
-- readable by nobody through the table itself.
revoke all on public.tools from anon, authenticated;

grant select (
  id, slug, name, tagline, description, website_url, docs_url, logo_url,
  pricing, pricing_model, tags, features, platforms, rating, rating_count,
  status, verified, developer_id, submitted_at, source, published_at,
  popularity_score, created_at, updated_at, canonical_domain, domain_verified_at
) on public.tools to anon, authenticated;

grant insert (
  slug, name, tagline, description, website_url, docs_url, logo_url,
  pricing, pricing_model, tags, features, platforms, owner_email
) on public.tools to authenticated;

grant update (
  name, tagline, description, website_url, docs_url, logo_url,
  pricing, pricing_model, tags, features, platforms, owner_email
) on public.tools to authenticated;

-- ------------------------------------------------------- reading the address

-- The only way to see owner_email. Two callers are allowed: the developer who
-- submitted the tool, and a reviewer holding submissions.review. Everybody
-- else gets nothing, and gets it without being told whether the tool exists.
create or replace function public.tool_verification_state(p_id uuid)
returns table (
  tool_id uuid,
  owner_email text,
  canonical_domain text,
  email_domain text,
  domain_matches boolean,
  domain_verified_at timestamptz,
  domain_verified_by uuid,
  domain_verified_note text
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_owner uuid;
begin
  select t.developer_id into v_owner from public.tools t where t.id = p_id;
  if v_owner is null and not exists (select 1 from public.tools t where t.id = p_id) then
    raise exception 'tool_not_found' using errcode = 'P0002';
  end if;

  if not (v_owner = (select auth.uid()) or public.has_admin_capability('submissions.review')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  select t.id,
         t.owner_email,
         t.canonical_domain,
         public.email_domain(t.owner_email),
         case when t.owner_email is null then null
              else public.email_domain(t.owner_email) = t.canonical_domain
                or public.email_domain(t.owner_email) like ('%.' || t.canonical_domain) end,
         t.domain_verified_at,
         t.domain_verified_by,
         t.domain_verified_note
    from public.tools t
   where t.id = p_id;
end;
$$;

revoke all on function public.tool_verification_state(uuid) from public, anon;
grant execute on function public.tool_verification_state(uuid) to authenticated;

revoke all on function public.normalize_domain(text) from public, anon;
revoke all on function public.email_domain(text) from public, anon;
revoke all on function public.is_free_email_domain(text) from public, anon;
grant execute on function public.normalize_domain(text) to authenticated;
grant execute on function public.email_domain(text) to authenticated;
grant execute on function public.is_free_email_domain(text) to authenticated;

-- -------------------------------------------------- a reviewer confirms it

create or replace function public.admin_confirm_tool_domain(
  p_id uuid,
  p_confirmed boolean,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_label text; v_email text; v_before timestamptz;
begin
  perform public.admin_require('submissions.review');

  select name, owner_email, domain_verified_at
    into v_label, v_email, v_before
    from public.tools where id = p_id;
  if v_label is null then
    raise exception 'tool_not_found' using errcode = 'P0002';
  end if;

  if p_confirmed and v_email is null then
    raise exception 'no_owner_email' using errcode = '22023';
  end if;

  update public.tools
     set domain_verified_at   = case when p_confirmed then now() else null end,
         domain_verified_by   = case when p_confirmed then (select auth.uid()) else null end,
         domain_verified_note = nullif(btrim(coalesce(p_note, '')), ''),
         updated_at = now()
   where id = p_id;

  -- The address itself is not written to the audit log. Who decided, when and
  -- about which tool is the record that matters; the address is already in the
  -- row and reachable by anybody entitled to it.
  perform public.admin_audit(
    case when p_confirmed then 'tool.domain_confirmed' else 'tool.domain_unconfirmed' end,
    'tool', p_id::text, v_label, p_note,
    jsonb_build_object('domain_verified', v_before is not null),
    jsonb_build_object('domain_verified', p_confirmed));
end;
$$;

revoke all on function public.admin_confirm_tool_domain(uuid, boolean, text) from public, anon;
grant execute on function public.admin_confirm_tool_domain(uuid, boolean, text) to authenticated;

-- -------------------------------------- submitting, and approving, gated

-- A developer cannot join the queue without giving an address to contact.
create or replace function public.submit_for_review(p_kind text, p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_status text; v_owner uuid; v_email text; v_source text;
begin
  if p_kind not in ('tool', 'model') then
    raise exception 'invalid_kind:%', p_kind using errcode = '22023';
  end if;

  if p_kind = 'tool' then
    select status, developer_id, owner_email, source
      into v_status, v_owner, v_email, v_source
      from public.tools where id = p_id;
  else
    select status, developer_id, null::text, source
      into v_status, v_owner, v_email, v_source
      from public.models where id = p_id;
  end if;

  if v_status is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_owner is distinct from (select auth.uid()) then
    raise exception 'not_yours' using errcode = '42501';
  end if;
  if not public.is_active_account() then
    raise exception 'account_not_active' using errcode = '42501';
  end if;
  if v_status not in ('draft', 'changes_required') then
    raise exception 'wrong_state:%', v_status using errcode = '22023';
  end if;

  if p_kind = 'tool' and v_source = 'developer_submission' and v_email is null then
    raise exception 'owner_email_required' using errcode = '22023';
  end if;

  if p_kind = 'tool' then
    update public.tools set status = 'pending', submitted_at = now(), updated_at = now() where id = p_id;
  else
    update public.models set status = 'pending', submitted_at = now(), updated_at = now() where id = p_id;
  end if;
end;
$$;

revoke all on function public.submit_for_review(text, uuid) from public, anon;
grant execute on function public.submit_for_review(text, uuid) to authenticated;

-- Approving a developer's tool is the act that publishes it. It is refused
-- until a human has confirmed the address replied, which is the entire
-- verification mechanism now that there is no verification mail.
create or replace function public.admin_review_submission(p_kind text, p_id uuid, p_decision text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_before text; v_label text; v_owner uuid; v_new text; v_source text; v_verified timestamptz;
begin
  perform public.admin_require('submissions.review');

  if p_kind not in ('tool', 'model') then
    raise exception 'invalid_kind:%', p_kind using errcode = '22023';
  end if;
  if p_decision not in ('approve', 'reject', 'request_changes', 'suspend', 'restore') then
    raise exception 'invalid_decision:%', p_decision using errcode = '22023';
  end if;
  -- Anything that sends work back to a developer has to say why, because they
  -- are the ones who have to act on it.
  if p_decision in ('reject', 'request_changes', 'suspend')
     and nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  v_new := case p_decision
    when 'approve' then 'approved'
    when 'reject'  then 'rejected'
    when 'request_changes' then 'changes_required'
    -- Suspending a live listing puts it back in the queue rather than deleting
    -- it: the developer keeps their work and the public stops seeing it.
    when 'suspend' then 'pending'
    when 'restore' then 'approved'
  end;

  if p_kind = 'tool' then
    select status, name, developer_id, source, domain_verified_at
      into v_before, v_label, v_owner, v_source, v_verified
      from public.tools where id = p_id;
    if v_before is null then raise exception 'tool_not_found' using errcode = 'P0002'; end if;

    if p_decision in ('approve', 'restore')
       and v_source = 'developer_submission'
       and v_verified is null then
      raise exception 'domain_not_confirmed' using errcode = '22023';
    end if;

    update public.tools
       set status = v_new,
           -- published_at is stamped once, on the first approval, so it keeps
           -- meaning "when this went live" through later edits.
           published_at = case when v_new = 'approved' then coalesce(published_at, now()) else published_at end,
           updated_at = now()
     where id = p_id;
  else
    select status, name, developer_id into v_before, v_label, v_owner
      from public.models where id = p_id;
    if v_before is null then raise exception 'model_not_found' using errcode = 'P0002'; end if;

    update public.models set status = v_new, updated_at = now() where id = p_id;
  end if;

  insert into public.moderation_actions (target_user, entity_type, entity_id, action, reason, actor_id)
  values (v_owner, p_kind, p_id,
          case p_decision when 'approve' then 'approve' when 'reject' then 'reject'
                          when 'request_changes' then 'request_changes'
                          when 'suspend' then 'hide' else 'unhide' end,
          p_reason, (select auth.uid()));

  perform public.admin_audit(p_kind || '.' || p_decision, p_kind, p_id::text, v_label, p_reason,
    jsonb_build_object('status', v_before), jsonb_build_object('status', v_new));
end;
$$;

revoke all on function public.admin_review_submission(text, uuid, text, text) from public, anon;
grant execute on function public.admin_review_submission(text, uuid, text, text) to authenticated;

-- Backfill the derived column for rows that predate the trigger.
update public.tools set updated_at = updated_at where website_url is not null;
