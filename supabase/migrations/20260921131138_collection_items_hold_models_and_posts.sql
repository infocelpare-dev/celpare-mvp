-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260921131138. History: never edit.

-- A collection could only ever hold a tool. The founder's brief is Save on a
-- tool, a model OR a post, so the item table has to describe all three.
--
-- THREE NULLABLE FKs, NOT AN entity_type PLUS entity_id PAIR. `saves` uses the
-- pair and it is the right shape there, because it is a private per person list
-- that nothing joins. A collection is published: it is rendered, counted and read
-- by other people, so a row pointing at a tool that no longer exists is a hole in
-- somebody's public page. Three real foreign keys keep ON DELETE CASCADE doing
-- that work, and a CHECK makes exactly one of them mandatory. This is the same
-- trade refused for search_result_events, decided the other way, because there
-- one column genuinely could not reference four tables and here three columns can.
--
-- The table is empty, so there is no data migration underneath any of this.

alter table public.user_collection_items
  add column if not exists model_id uuid references public.models(id) on delete cascade,
  add column if not exists post_id  uuid references public.posts(id)  on delete cascade;

-- tool_id was part of the primary key and therefore NOT NULL. A row holding a
-- model has no tool, so the key has to move.
alter table public.user_collection_items drop constraint if exists user_collection_items_pkey;
alter table public.user_collection_items alter column tool_id drop not null;

alter table public.user_collection_items
  add column if not exists id uuid not null default gen_random_uuid();
alter table public.user_collection_items add primary key (id);

-- Exactly one. Not "at least one": a row with both a tool and a post would be
-- counted once and rendered twice.
alter table public.user_collection_items drop constraint if exists uci_one_entity;
alter table public.user_collection_items add constraint uci_one_entity check (
  (tool_id is not null)::int + (model_id is not null)::int + (post_id is not null)::int = 1
);

-- What the old primary key was really for: the same thing cannot be in the same
-- collection twice. Partial, one per entity kind, because a null never equals a
-- null and a plain unique across three columns would not stop a second row.
create unique index if not exists uci_one_tool_per_collection
  on public.user_collection_items (collection_id, tool_id) where tool_id is not null;
create unique index if not exists uci_one_model_per_collection
  on public.user_collection_items (collection_id, model_id) where model_id is not null;
create unique index if not exists uci_one_post_per_collection
  on public.user_collection_items (collection_id, post_id) where post_id is not null;

-- REVOKE BEFORE GRANT on the new columns, then grant exactly what the old ones
-- had. The RLS policies all key on collection_id and are untouched by this.
revoke all (id, model_id, post_id) on public.user_collection_items from anon, authenticated;
grant select (id, model_id, post_id) on public.user_collection_items to anon;
grant select (id, model_id, post_id), insert (id, model_id, post_id), update (model_id, post_id)
  on public.user_collection_items to authenticated;
