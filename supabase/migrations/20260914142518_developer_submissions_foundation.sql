-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260914142518. History: never edit.

-- Developer Mode, part two: submissions, and the two live defects that had to
-- be closed before any developer could write a row.
--
-- DEFECT 1: tools.status and models.status both DEFAULT to 'approved'. An
-- INSERT policy without fixing that would put every submission straight into
-- the public catalogue and into Ask Celpare's search results, which is
-- self approval by default. Default is now 'draft'.
--
-- DEFECT 2 (G35): tools and models grant arwdDxtm to BOTH anon and
-- authenticated. They are safe today only because no write policy exists. The
-- moment one is added, every signed in user can UPDATE all 25 columns of a row
-- they own, including `status`, `verified` and `developer_id`. Narrowed below
-- to explicit column lists, which is what the doctrine has always claimed.
--
-- Neither of these is theoretical: adding the policies in this same migration
-- without the fixes would have shipped both.

-- ===========================================================================
-- Status vocabulary and safe defaults
-- ===========================================================================
alter table public.tools drop constraint if exists tools_status_check;
alter table public.tools add constraint tools_status_check
  check (status in ('draft', 'pending', 'changes_required', 'approved', 'rejected'));
alter table public.tools alter column status set default 'draft';
alter table public.tools alter column source set default 'developer_submission';

alter table public.models drop constraint if exists models_status_check;
alter table public.models add constraint models_status_check
  check (status in ('draft', 'pending', 'changes_required', 'approved', 'rejected'));
alter table public.models alter column status set default 'draft';
alter table public.models alter column source set default 'developer_submission';

-- Models had no owner at all, so there was nothing to scope a policy to.
alter table public.models
  add column developer_id uuid references public.profiles(id) on delete set null;

create index idx_models_developer on public.models (developer_id, created_at desc);
create index idx_tools_developer on public.tools (developer_id, created_at desc);

-- ===========================================================================
-- The invariants a client must never be able to break, enforced by trigger
-- rather than hoped for. Column grants stop a client NAMING these columns;
-- this stops the values being wrong by any other route, including defaults.
-- ===========================================================================
create or replace function public.tg_submission_guard()
returns trigger
language plpgsql
security definer
set search_path = public
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
  return new;
end;
$$;

revoke all on function public.tg_submission_guard() from public, anon, authenticated;

/* models has no `verified` or `published_at` column, so it needs its own. */
create or replace function public.tg_model_submission_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.developer_id := (select auth.uid());
    new.status       := 'draft';
    new.source       := 'developer_submission';
    new.submitted_at := now();
    return new;
  end if;

  new.status       := old.status;
  new.developer_id := old.developer_id;
  new.source       := old.source;
  new.submitted_at := old.submitted_at;
  return new;
end;
$$;

revoke all on function public.tg_model_submission_guard() from public, anon, authenticated;

/*
  Only fires for a client. The admin seed path and any future moderation RPC
  run as postgres or service_role and must stay able to set a real status,
  otherwise nothing could ever be approved.
*/
create or replace function public.is_client_role()
returns boolean
language sql
stable
as $$
  select current_user in ('authenticated', 'anon');
$$;

create trigger tools_submission_guard
  before insert or update on public.tools
  for each row when (public.is_client_role())
  execute function public.tg_submission_guard();

create trigger models_submission_guard
  before insert or update on public.models
  for each row when (public.is_client_role())
  execute function public.tg_model_submission_guard();

-- ===========================================================================
-- Per developer submission cap.
--
-- NOT the pricing cap. 05-pricing-plans.md gives developer Free 2 tools, Pro 5
-- and Elite unlimited, but developer PLANS are not modelled anywhere:
-- profiles.plan is the user plan and says nothing about developer tier. So
-- this is a safety ceiling against an unbounded write, not a commercial limit,
-- and it is logged as a gap rather than dressed up as the real thing.
-- ===========================================================================
insert into public.plan_limits (plan, limit_key, limit_value) values
  ('free', 'developer_tools', 25), ('pro', 'developer_tools', 25), ('premium', 'developer_tools', 25),
  ('free', 'developer_models', 25), ('pro', 'developer_models', 25), ('premium', 'developer_models', 25);

create trigger tools_dev_cap before insert on public.tools
  for each row when (public.is_client_role())
  execute function public.tg_enforce_owner_cap('developer_id', 'developer_tools');

create trigger models_dev_cap before insert on public.models
  for each row when (public.is_client_role())
  execute function public.tg_enforce_owner_cap('developer_id', 'developer_models');

-- ===========================================================================
-- RLS. Read stays as it was; write is new and is gated on is_active_developer().
-- ===========================================================================
drop policy if exists tools_select_approved on public.tools;
drop policy if exists models_select_approved on public.models;

create policy tools_select_anon on public.tools
  for select to anon using (status = 'approved');
create policy tools_select_auth on public.tools
  for select to authenticated
  using (status = 'approved' or developer_id = (select auth.uid()) or public.is_moderator());

create policy models_select_anon on public.models
  for select to anon using (status = 'approved');
create policy models_select_auth on public.models
  for select to authenticated
  using (status = 'approved' or developer_id = (select auth.uid()) or public.is_moderator());

/*
  Insert requires an accepted terms row. The toggle is not consulted, and
  neither is any role or plan. WITH CHECK names developer_id explicitly as
  well, even though the trigger already forces it, because two independent
  controls on ownership is the standard this project set for the AI boundary.
*/
create policy tools_insert_developer on public.tools
  for insert to authenticated
  with check (public.is_active_developer() and developer_id = (select auth.uid()));

create policy models_insert_developer on public.models
  for insert to authenticated
  with check (public.is_active_developer() and developer_id = (select auth.uid()));

/*
  A developer may edit their own submission only while it is still theirs to
  edit. Once it is pending review or approved, editing is a resubmission and
  that is a later step, not a silent overwrite of a record people are reading.
*/
create policy tools_update_own_draft on public.tools
  for update to authenticated
  using (public.is_active_developer() and developer_id = (select auth.uid())
         and status in ('draft', 'changes_required'))
  with check (developer_id = (select auth.uid()));

create policy models_update_own_draft on public.models
  for update to authenticated
  using (public.is_active_developer() and developer_id = (select auth.uid())
         and status in ('draft', 'changes_required'))
  with check (developer_id = (select auth.uid()));

-- No DELETE policy on either. A submission is withdrawn through moderation,
-- not erased from under a reviewer.

-- ===========================================================================
-- Grants, narrowed. This is the G35 fix for these two tables.
-- ===========================================================================
revoke all on public.tools from public, anon, authenticated;
revoke all on public.models from public, anon, authenticated;

grant select (
  id, slug, name, tagline, description, website_url, docs_url, logo_url,
  pricing, pricing_model, tags, features, platforms, rating, rating_count,
  status, verified, developer_id, submitted_at, source, published_at,
  popularity_score, created_at, updated_at
) on public.tools to anon, authenticated;

grant select (
  id, slug, name, provider, description, context_window, input_price_per_m,
  output_price_per_m, modalities, tags, website_url, status, developer_id,
  submitted_at, source, created_at, updated_at
) on public.models to anon, authenticated;

-- The content of a submission, and nothing else. status, verified,
-- developer_id, source, submitted_at, published_at, rating, rating_count and
-- popularity_score are absent, so a client cannot name them at all.
grant insert (
  slug, name, tagline, description, website_url, docs_url, logo_url,
  pricing, pricing_model, tags, features, platforms
) on public.tools to authenticated;

grant update (
  name, tagline, description, website_url, docs_url, logo_url,
  pricing, pricing_model, tags, features, platforms
) on public.tools to authenticated;
-- slug is insert only. It is the public URL of the record, so it stops being
-- the author's to change the moment anything links to it.

grant insert (
  slug, name, provider, description, context_window, input_price_per_m,
  output_price_per_m, modalities, tags, website_url
) on public.models to authenticated;

grant update (
  name, provider, description, context_window, input_price_per_m,
  output_price_per_m, modalities, tags, website_url
) on public.models to authenticated;

-- ===========================================================================
-- Submitting for review: a state change, so an RPC rather than a column grant.
-- ===========================================================================
create or replace function public.submit_for_review(p_kind text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare owner uuid; st text;
begin
  if not public.is_active_developer() then
    raise exception 'not_a_developer' using errcode = '42501';
  end if;

  if p_kind = 'tool' then
    select developer_id, status into owner, st from public.tools where id = p_id;
  elsif p_kind = 'model' then
    select developer_id, status into owner, st from public.models where id = p_id;
  else
    raise exception 'invalid_kind:%', p_kind using errcode = '22023';
  end if;

  if owner is null or owner <> (select auth.uid()) then
    raise exception 'not_yours' using errcode = '42501';
  end if;
  if st not in ('draft', 'changes_required') then
    raise exception 'not_submittable:%', st using errcode = '22023';
  end if;

  if p_kind = 'tool' then
    update public.tools set status = 'pending', submitted_at = now(), updated_at = now() where id = p_id;
  else
    update public.models set status = 'pending', submitted_at = now(), updated_at = now() where id = p_id;
  end if;
end;
$$;

revoke all on function public.submit_for_review(text, uuid) from public, anon, authenticated;
grant execute on function public.submit_for_review(text, uuid) to authenticated;
