-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260919095947. History: never edit.

-- A post carries an editorial KIND, and optionally one catalogue attachment.
--
-- kind is what the author says the post IS. tool_id and model_id are what it
-- actually carries. The constraint below ties them together, so nothing can
-- call itself a tool post without a real tool behind it, which is the same
-- rule D13 and D30 set for invented metrics and fake activity.
--
-- 'image' and 'video' are valid kinds but are NOT offered in the composer:
-- they are facts about a post derived from whether media was attached, not an
-- editorial choice somebody makes.

alter table public.posts
  add column kind text not null default 'text',
  add column tool_id uuid references public.tools(id) on delete set null,
  add column model_id uuid references public.models(id) on delete set null;

alter table public.posts
  add constraint posts_kind_ok check (kind in (
    'text','image','video','link','tool','model','launch','question','announcement'
  ));

-- One attachment at most. A post about a tool AND a model is two posts.
alter table public.posts
  add constraint posts_one_attachment
  check (not (tool_id is not null and model_id is not null));

-- The label has to be true.
alter table public.posts
  add constraint posts_kind_matches_attachment check (
    (kind <> 'tool'  or tool_id  is not null) and
    (kind <> 'model' or model_id is not null)
  );

create index posts_tool_idx  on public.posts (tool_id)  where tool_id  is not null;
create index posts_model_idx on public.posts (model_id) where model_id is not null;

-- The client grant is narrowed on this table, so new columns have to be added
-- to it explicitly. Without this the columns exist and are invisible, and a
-- select naming them fails with 42501.
grant select (kind, tool_id, model_id) on public.posts to anon, authenticated;
grant insert (kind, tool_id, model_id) on public.posts to authenticated;
grant update (kind, tool_id, model_id) on public.posts to authenticated;
