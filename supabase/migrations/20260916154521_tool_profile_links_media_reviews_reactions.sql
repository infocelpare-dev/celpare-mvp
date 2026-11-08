-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260916154521. History: never edit.

-- Everything the public tool profile needs and did not have: links, media,
-- ratings with reviews, and like/dislike.
--
-- Doctrine, because a new table in public is granted everything to anon by
-- default: REVOKE BEFORE GRANT on every one of these, RLS on, policies written
-- before a single row can exist.
--
-- What is deliberately NOT here: a saves table (user_saved_tools exists) and a
-- reports table (reports already accepts entity_type = 'tool'). Reusing those
-- is the point.

-- ---------------------------------------------------------------- tool_links

create table if not exists public.tool_links (
  tool_id uuid not null references public.tools(id) on delete cascade,
  kind text not null,
  url text not null,
  primary key (tool_id, kind),
  constraint tool_links_kind_ok check (kind = any (array[
    'demo','github','discord','x','linkedin','api','changelog','pricing','other'
  ])),
  constraint tool_links_url_ok check (url ~ '^https?://' and char_length(url) <= 2048)
);

comment on table public.tool_links is
  'The extra official links. website_url and docs_url stay on tools: they are load bearing (the domain is what owner verification checks) and moving them would be a migration for no gain.';

alter table public.tool_links enable row level security;
revoke all on public.tool_links from anon, authenticated;
grant select on public.tool_links to anon, authenticated;
grant insert (tool_id, kind, url), update (url), delete on public.tool_links to authenticated;

-- ---------------------------------------------------------------- tool_media

create table if not exists public.tool_media (
  id uuid primary key default gen_random_uuid(),
  tool_id uuid not null references public.tools(id) on delete cascade,
  kind text not null,
  url text not null,
  caption text,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  constraint tool_media_kind_ok check (kind = any (array['cover','screenshot','video'])),
  constraint tool_media_url_ok check (url ~ '^https://' and char_length(url) <= 2048),
  constraint tool_media_caption_len check (caption is null or char_length(caption) <= 200)
);

-- One cover, many screenshots and videos.
create unique index if not exists tool_media_one_cover
  on public.tool_media (tool_id) where kind = 'cover';
create index if not exists tool_media_tool_idx on public.tool_media (tool_id, kind, sort_order);

comment on column public.tool_media.url is
  'https only, and no upload path yet: these are URLs the developer supplies, the same position tools.logo_url is in. A media bucket is 4U.1 and this table is ready for it.';

alter table public.tool_media enable row level security;
revoke all on public.tool_media from anon, authenticated;
grant select on public.tool_media to anon, authenticated;
grant insert (tool_id, kind, url, caption, sort_order), update (url, caption, sort_order), delete
  on public.tool_media to authenticated;

-- Both tables answer the same question about who may write: the tool's own
-- active developer, while the tool is still editable. Written once.
create or replace function public.may_edit_tool(p_tool_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.tools t
    where t.id = p_tool_id
      and t.developer_id = (select auth.uid())
      and t.status in ('draft', 'changes_required')
      and public.is_active_developer()
  );
$$;

revoke all on function public.may_edit_tool(uuid) from public, anon;
grant execute on function public.may_edit_tool(uuid) to authenticated;

do $$
begin
  -- Public read follows the tool: if you can see the tool, you can see its
  -- links and media. RLS on tools is what decides that, so this mirrors it
  -- rather than inventing a second rule.
  if not exists (select 1 from pg_policy where polname = 'tool_links_select') then
    create policy tool_links_select on public.tool_links for select to anon, authenticated
      using (exists (select 1 from public.tools t where t.id = tool_id));
  end if;
  if not exists (select 1 from pg_policy where polname = 'tool_links_write') then
    create policy tool_links_write on public.tool_links for all to authenticated
      using (public.may_edit_tool(tool_id)) with check (public.may_edit_tool(tool_id));
  end if;
  if not exists (select 1 from pg_policy where polname = 'tool_media_select') then
    create policy tool_media_select on public.tool_media for select to anon, authenticated
      using (exists (select 1 from public.tools t where t.id = tool_id));
  end if;
  if not exists (select 1 from pg_policy where polname = 'tool_media_write') then
    create policy tool_media_write on public.tool_media for all to authenticated
      using (public.may_edit_tool(tool_id)) with check (public.may_edit_tool(tool_id));
  end if;
end $$;

-- -------------------------------------------------------------- tool_reviews

create table if not exists public.tool_reviews (
  id uuid primary key default gen_random_uuid(),
  tool_id uuid not null references public.tools(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rating smallint not null,
  body text,
  status text not null default 'visible',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tool_reviews_rating_ok check (rating between 1 and 5),
  constraint tool_reviews_body_len check (body is null or char_length(body) <= 2000),
  constraint tool_reviews_status_ok check (status = any (array['visible','hidden','removed'])),
  -- One per person per tool. The duplicate is refused by the database, not by
  -- a check in an action that a second request can race past.
  constraint tool_reviews_one_per_person unique (tool_id, user_id)
);

create index if not exists tool_reviews_tool_idx
  on public.tool_reviews (tool_id, created_at desc) where status = 'visible';

alter table public.tool_reviews enable row level security;
revoke all on public.tool_reviews from anon, authenticated;
grant select on public.tool_reviews to anon, authenticated;
grant insert (tool_id, rating, body), update (rating, body), delete
  on public.tool_reviews to authenticated;

do $$
begin
  if not exists (select 1 from pg_policy where polname = 'tool_reviews_select') then
    create policy tool_reviews_select on public.tool_reviews for select to anon, authenticated
      using (status = 'visible' or user_id = (select auth.uid()) or public.is_moderator());
  end if;
  -- Writing needs an account in good standing. A suspended person cannot
  -- review, the same rule every other community write follows.
  if not exists (select 1 from pg_policy where polname = 'tool_reviews_insert') then
    create policy tool_reviews_insert on public.tool_reviews for insert to authenticated
      with check (user_id = (select auth.uid()) and public.is_active_account());
  end if;
  -- Update stays open to a suspended person on purpose, per D78: they may
  -- still retract or correct what is already theirs.
  if not exists (select 1 from pg_policy where polname = 'tool_reviews_update') then
    create policy tool_reviews_update on public.tool_reviews for update to authenticated
      using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policy where polname = 'tool_reviews_delete') then
    create policy tool_reviews_delete on public.tool_reviews for delete to authenticated
      using (user_id = (select auth.uid()));
  end if;
end $$;

-- user_id is not in the insert grant, so it cannot be supplied. This sets it.
create or replace function public.tg_tool_review_owner()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if tg_op = 'INSERT' then
    new.user_id := (select auth.uid());
    new.status  := 'visible';
  else
    -- A reviewer cannot hide or unhide their own review, and cannot hand it to
    -- somebody else. Moderation owns status.
    new.user_id := old.user_id;
    new.status  := old.status;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.tg_tool_review_owner() from public, anon, authenticated;

drop trigger if exists tool_reviews_owner on public.tool_reviews;
create trigger tool_reviews_owner
  before insert or update on public.tool_reviews
  for each row when (public.is_client_role()) execute function public.tg_tool_review_owner();

-- The aggregate is COMPUTED, never written by hand. D13 and D30 forbid a
-- number that did not come from real rows, and this is the only writer.
create or replace function public.tg_tool_rating_rollup()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_tool uuid := coalesce(new.tool_id, old.tool_id);
begin
  update public.tools t
     set rating = sub.avg_rating,
         rating_count = sub.n
    from (
      select avg(r.rating)::numeric(3,2) as avg_rating, count(*)::int as n
        from public.tool_reviews r
       where r.tool_id = v_tool and r.status = 'visible'
    ) sub
   where t.id = v_tool;
  return null;
end;
$$;

revoke all on function public.tg_tool_rating_rollup() from public, anon, authenticated;

drop trigger if exists tool_reviews_rollup on public.tool_reviews;
create trigger tool_reviews_rollup
  after insert or update or delete on public.tool_reviews
  for each row execute function public.tg_tool_rating_rollup();

-- ------------------------------------------------------------ tool_reactions

-- Not public.likes. That table is (user_id, entity_type, entity_id) with no
-- value column, and tg_likes_count counts its ROWS with one meaning. Putting
-- dislikes in it would either need a value column that breaks every existing
-- count, or a second row per person, which breaks "one reaction per person".
create table if not exists public.tool_reactions (
  user_id uuid not null references auth.users(id) on delete cascade,
  tool_id uuid not null references public.tools(id) on delete cascade,
  value smallint not null,
  created_at timestamptz not null default now(),
  primary key (user_id, tool_id),
  constraint tool_reactions_value_ok check (value in (-1, 1))
);

comment on table public.tool_reactions is
  'One row per person per tool, holding a like (1) or a dislike (-1). The primary key is what makes a duplicate impossible, and switching sides is an upsert rather than a second row.';

create index if not exists tool_reactions_tool_idx on public.tool_reactions (tool_id, value);

alter table public.tool_reactions enable row level security;
revoke all on public.tool_reactions from anon, authenticated;
grant select on public.tool_reactions to authenticated;
grant insert (tool_id, value), update (value), delete on public.tool_reactions to authenticated;

do $$
begin
  -- Your own reaction is yours to read. Nobody reads anybody else's: the
  -- public number comes off tools.like_count, not off counting this table.
  if not exists (select 1 from pg_policy where polname = 'tool_reactions_own') then
    create policy tool_reactions_own on public.tool_reactions for all to authenticated
      using (user_id = (select auth.uid()))
      with check (user_id = (select auth.uid()) and public.is_active_account());
  end if;
end $$;

alter table public.tools
  add column if not exists like_count integer not null default 0,
  add column if not exists dislike_count integer not null default 0;

comment on column public.tools.dislike_count is
  'Founder decision: recorded, and never shown publicly. It is not in the anon or authenticated select grant, so a client cannot read it at all. The tool owner and staff see it through tool_owner_stats().';

create or replace function public.tg_tool_reaction_owner()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if tg_op = 'INSERT' then new.user_id := (select auth.uid()); end if;
  return new;
end;
$$;

revoke all on function public.tg_tool_reaction_owner() from public, anon, authenticated;

drop trigger if exists tool_reactions_owner on public.tool_reactions;
create trigger tool_reactions_owner
  before insert on public.tool_reactions
  for each row when (public.is_client_role()) execute function public.tg_tool_reaction_owner();

create or replace function public.tg_tool_reaction_count()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_tool uuid := coalesce(new.tool_id, old.tool_id);
begin
  update public.tools t
     set like_count = sub.likes, dislike_count = sub.dislikes
    from (
      select count(*) filter (where r.value = 1)::int as likes,
             count(*) filter (where r.value = -1)::int as dislikes
        from public.tool_reactions r where r.tool_id = v_tool
    ) sub
   where t.id = v_tool;
  return null;
end;
$$;

revoke all on function public.tg_tool_reaction_count() from public, anon, authenticated;

drop trigger if exists tool_reactions_count on public.tool_reactions;
create trigger tool_reactions_count
  after insert or update or delete on public.tool_reactions
  for each row execute function public.tg_tool_reaction_count();

-- like_count is public. dislike_count is not granted to anybody.
grant select (like_count) on public.tools to anon, authenticated;

-- The private half, for the developer who owns the tool and for staff.
create or replace function public.tool_owner_stats(p_tool_id uuid)
returns table (like_count integer, dislike_count integer, review_count integer)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare v_owner uuid;
begin
  select t.developer_id into v_owner from public.tools t where t.id = p_tool_id;
  if not (v_owner = (select auth.uid()) or public.is_moderator()
          or public.has_admin_capability('submissions.review')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select t.like_count, t.dislike_count, t.rating_count
      from public.tools t where t.id = p_tool_id;
end;
$$;

revoke all on function public.tool_owner_stats(uuid) from public, anon;
grant execute on function public.tool_owner_stats(uuid) to authenticated;
