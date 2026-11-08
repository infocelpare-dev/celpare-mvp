-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260914091938. History: never edit.

-- Plan capped, per docs/context/05-pricing-plans.md.
--   Saved tools: 5 free, 15 pro, unlimited premium.
--   Collections: none free, 10 pro, unlimited premium.
--
-- The caps are enforced by a BEFORE INSERT trigger, not by the UI and not by
-- RLS. A signed in user holds a valid JWT and the publishable key and can POST
-- straight to PostgREST, so the UI and the server actions are advisory. A RLS
-- WITH CHECK that counts rows in the same table runs under the caller's RLS,
-- evaluates per row, and is not race safe. The trigger is the only layer
-- inside the same transaction as the insert.
--
-- It works only because profiles.plan is absent from the authenticated UPDATE
-- grant. That grant is the load bearing dependency for every cap below.
--
-- INSERT only. A downgrade goes read only and never destroys rows.

-- ---------------------------------------------------------------------------
-- user_saved_tools. Private, like saves.
-- ---------------------------------------------------------------------------
create table public.user_saved_tools (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  tool_id    uuid not null references public.tools(id) on delete cascade,
  note       text,
  created_at timestamptz not null default now(),
  primary key (user_id, tool_id),
  constraint ust_note_len check (note is null or char_length(note) <= 280)
);

create index idx_ust_user_recent on public.user_saved_tools (user_id, created_at desc);
create index idx_ust_tool on public.user_saved_tools (tool_id);

create trigger ust_plan_cap before insert on public.user_saved_tools
  for each row execute function public.tg_enforce_owner_cap('user_id', 'saved_tools');

alter table public.user_saved_tools enable row level security;

-- Private for the same reason saves is private. No anon policy, no cross user
-- policy, no moderator policy.
create policy ust_select_own on public.user_saved_tools
  for select to authenticated using (auth.uid() = user_id);
create policy ust_insert_own on public.user_saved_tools
  for insert to authenticated with check (auth.uid() = user_id);
create policy ust_update_own on public.user_saved_tools
  for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy ust_delete_own on public.user_saved_tools
  for delete to authenticated using (auth.uid() = user_id);

revoke all on public.user_saved_tools from public, anon, authenticated;
grant select (user_id, tool_id, note, created_at) on public.user_saved_tools to authenticated;
grant insert (user_id, tool_id, note)             on public.user_saved_tools to authenticated;
grant update (note)                               on public.user_saved_tools to authenticated;
grant delete                                      on public.user_saved_tools to authenticated;

-- ---------------------------------------------------------------------------
-- user_collections
-- ---------------------------------------------------------------------------
create table public.user_collections (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  name        text not null,
  description text,
  is_public   boolean not null default false,
  item_count  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,

  constraint uc_name_len check (char_length(name) between 1 and 80),
  constraint uc_desc_len check (description is null or char_length(description) <= 500),

  -- The per collection item cap comes free: the counter trigger writes
  -- item_count and this CHECK rejects the 201st insert. No second trigger.
  constraint uc_item_count_ok check (item_count >= 0 and item_count <= 200),

  constraint uc_name_unique_per_user unique (user_id, name)
);

create index idx_uc_user_recent on public.user_collections (user_id, created_at desc)
  where deleted_at is null;
create index idx_uc_public on public.user_collections (user_id, created_at desc)
  where deleted_at is null and is_public;

create trigger uc_touch_updated_at
  before update of name, description, is_public, deleted_at on public.user_collections
  for each row execute function public.touch_updated_at();

-- The extra predicate excludes soft deleted collections from the cap, so
-- deleting one frees a slot. The argument comes from this DDL, never a client.
create trigger uc_plan_cap before insert on public.user_collections
  for each row execute function
    public.tg_enforce_owner_cap('user_id', 'collections', 'deleted_at is null');

alter table public.user_collections enable row level security;

create policy uc_select_public on public.user_collections
  for select to anon, authenticated
  using (is_public and deleted_at is null);
create policy uc_select_own on public.user_collections
  for select to authenticated using (auth.uid() = user_id);
create policy uc_insert_own on public.user_collections
  for insert to authenticated with check (auth.uid() = user_id);
create policy uc_update_own on public.user_collections
  for update to authenticated
  using (auth.uid() = user_id and deleted_at is null)
  with check (auth.uid() = user_id);

-- No DELETE policy and no DELETE grant. Soft delete only.

revoke all on public.user_collections from public, anon, authenticated;
grant select (id, user_id, name, description, is_public, item_count,
              created_at, updated_at, deleted_at)
  on public.user_collections to anon, authenticated;
grant insert (user_id, name, description, is_public) on public.user_collections to authenticated;
grant update (name, description, is_public, deleted_at) on public.user_collections to authenticated;
-- item_count is absent from both write lists. It is trigger owned.

-- ---------------------------------------------------------------------------
-- user_collection_items
-- ---------------------------------------------------------------------------
create table public.user_collection_items (
  collection_id uuid not null references public.user_collections(id) on delete cascade,
  tool_id       uuid not null references public.tools(id) on delete cascade,
  sort_order    smallint not null default 0,
  created_at    timestamptz not null default now(),
  primary key (collection_id, tool_id)
);

create index idx_uci_order on public.user_collection_items (collection_id, sort_order, created_at);
create index idx_uci_tool  on public.user_collection_items (tool_id);

create or replace function public.tg_collection_item_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    -- Raises through uc_item_count_ok at 201, which is the per collection cap.
    update public.user_collections
       set item_count = item_count + 1 where id = new.collection_id;
    return new;
  end if;
  update public.user_collections
     set item_count = greatest(item_count - 1, 0) where id = old.collection_id;
  return old;
end;
$$;

revoke all on function public.tg_collection_item_count() from public, anon, authenticated;

create trigger uci_count_maintain
  after insert or delete on public.user_collection_items
  for each row execute function public.tg_collection_item_count();

alter table public.user_collection_items enable row level security;

-- Visibility follows the parent collection, always. A private collection's
-- items are private, and an item cannot be read out from under its parent.
create policy uci_select_public on public.user_collection_items
  for select to anon, authenticated
  using (exists (
    select 1 from public.user_collections c
    where c.id = user_collection_items.collection_id
      and c.is_public and c.deleted_at is null));

create policy uci_select_own on public.user_collection_items
  for select to authenticated
  using (exists (
    select 1 from public.user_collections c
    where c.id = user_collection_items.collection_id
      and c.user_id = auth.uid()));

create policy uci_write_own on public.user_collection_items
  for all to authenticated
  using (exists (
    select 1 from public.user_collections c
    where c.id = user_collection_items.collection_id
      and c.user_id = auth.uid() and c.deleted_at is null))
  with check (exists (
    select 1 from public.user_collections c
    where c.id = user_collection_items.collection_id
      and c.user_id = auth.uid() and c.deleted_at is null));

revoke all on public.user_collection_items from public, anon, authenticated;
grant select (collection_id, tool_id, sort_order, created_at)
  on public.user_collection_items to anon, authenticated;
grant insert (collection_id, tool_id, sort_order) on public.user_collection_items to authenticated;
grant update (sort_order) on public.user_collection_items to authenticated;
grant delete on public.user_collection_items to authenticated;
