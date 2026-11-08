-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260914132907. History: never edit.

-- Founder instruction 2026-09-14: a Models tab beside Tools on the profile.
--
-- Notion's own "User profile" page asks for exactly this: "Collections, saved
-- tools and models and viewed tools". Saved models were in the spec and were
-- missed when user_saved_tools was built.
--
-- A mirror of user_saved_tools, deliberately: same shape, same privacy, same
-- cap mechanism. Two adjacent tabs that behave differently would be worse than
-- either behaviour on its own.
--
-- 05-pricing-plans.md prices "saved tools" and says nothing about models, so
-- the models cap matches the tools cap rather than inventing a second number.
-- G24 already covers confirming the real figures.

create table public.user_saved_models (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  model_id   uuid not null references public.models(id) on delete cascade,
  note       text,
  created_at timestamptz not null default now(),
  primary key (user_id, model_id),
  constraint usm_note_len check (note is null or char_length(note) <= 280)
);

create index idx_usm_user_recent on public.user_saved_models (user_id, created_at desc);
create index idx_usm_model on public.user_saved_models (model_id);

insert into public.plan_limits (plan, limit_key, limit_value) values
  ('free',    'saved_models',    5),
  ('pro',     'saved_models',   15),
  ('premium', 'saved_models', null);

create trigger usm_plan_cap before insert on public.user_saved_models
  for each row execute function public.tg_enforce_owner_cap('user_id', 'saved_models');

alter table public.user_saved_models enable row level security;

-- Private, exactly like user_saved_tools and saves. No anon policy, no cross
-- user policy, no moderator policy.
create policy usm_select_own on public.user_saved_models
  for select to authenticated using ((select auth.uid()) = user_id);
create policy usm_insert_own on public.user_saved_models
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy usm_update_own on public.user_saved_models
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy usm_delete_own on public.user_saved_models
  for delete to authenticated using ((select auth.uid()) = user_id);

-- The revoke before the grant, as with every table in this set: Supabase
-- default privileges would otherwise leave anon holding the lot.
revoke all on public.user_saved_models from public, anon, authenticated;
grant select (user_id, model_id, note, created_at) on public.user_saved_models to authenticated;
grant insert (user_id, model_id, note)             on public.user_saved_models to authenticated;
grant update (note)                                on public.user_saved_models to authenticated;
grant delete                                       on public.user_saved_models to authenticated;
