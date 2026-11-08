-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260914091859. History: never edit.

-- Profile identity fields.
--
-- D72: there is NO role or persona column. The founder settled it: there are
-- two kinds of person, user and developer, and profiles.is_developer already
-- encodes that. A self asserted cosmetic column containing the literal value
-- 'developer', sitting next to the real privilege flag, was the most likely
-- future privilege bug in this design. It cannot be misused because it does
-- not exist.

alter table public.profiles
  add column location    text,
  add column website_url text,
  add column interests   text[] not null default '{}',
  add column skills      text[] not null default '{}';

alter table public.profiles
  add constraint profiles_location_len check (
    location is null or char_length(location) <= 80),

  add constraint profiles_website_url_ok check (
    website_url is null
    or (char_length(website_url) <= 2048
        and website_url ~ '^https?://[^[:space:]]+$')),

  -- A CHECK cannot contain a subquery, so per element validation through
  -- unnest is not available. array_to_string is IMMUTABLE and caps the total
  -- payload, which is what actually matters: these are client writable columns
  -- on a row every profile page reads.
  add constraint profiles_interests_ok check (
    cardinality(interests) <= 20
    and char_length(array_to_string(interests, ',')) <= 400),

  add constraint profiles_skills_ok check (
    cardinality(skills) <= 20
    and char_length(array_to_string(skills, ',')) <= 400);

comment on column public.profiles.interests is
  'User controlled text the AI may read. Untrusted input, same rule as bio:
   never placed above a system rule in a prompt. See 03-data-model.md.';
comment on column public.profiles.skills is
  'User controlled text the AI may read. Untrusted input, same rule as bio.';

create index idx_profiles_interests on public.profiles using gin (interests);
create index idx_profiles_skills    on public.profiles using gin (skills);

-- Extending the existing profiles grants. The authenticated UPDATE list was
-- exactly: ask_settings, avatar_url, bio, full_name, is_developer,
-- onboarded_at, username. It becomes that plus these four.
-- Still absent and staying absent: email, plan, role, follower_count,
-- following_count, created_at, updated_at, id.
grant select (location, website_url, interests, skills)
  on public.profiles to anon, authenticated;
grant update (location, website_url, interests, skills)
  on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Favourites: unordered sets, real foreign keys.
--
-- A uuid[] column was rejected because tools and models CAN be hard deleted,
-- so an array would hold dangling ids forever with no way to clean them. The
-- read path joins tools to filter status = 'approved' regardless, so the join
-- happens either way and the referential integrity comes free.
-- ---------------------------------------------------------------------------
create table public.profile_favorite_tools (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  tool_id    uuid not null references public.tools(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, tool_id)
);
create index idx_pft_tool on public.profile_favorite_tools (tool_id);

create table public.profile_favorite_models (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  model_id   uuid not null references public.models(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, model_id)
);
create index idx_pfm_model on public.profile_favorite_models (model_id);

-- ---------------------------------------------------------------------------
-- Featured: ordered, so a join table is the only honest shape.
--
-- The column is sort_order, not position: POSITION is a SQL function name, and
-- topics.sort_order and categories.sort_order already set the convention.
--
-- The unique constraint is DEFERRABLE INITIALLY DEFERRED so a reorder can be N
-- updates in one transaction without a mid transaction collision. This is also
-- exactly why favourites and featured are not one table with a kind column: a
-- PARTIAL unique index cannot be deferred, because only constraints defer and
-- constraints cannot be partial.
-- ---------------------------------------------------------------------------
create table public.profile_featured_tools (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  tool_id    uuid not null references public.tools(id) on delete cascade,
  sort_order smallint not null,
  created_at timestamptz not null default now(),
  primary key (profile_id, tool_id),
  constraint pfeat_tools_order_ok check (sort_order between 1 and 12),
  constraint pfeat_tools_order_uniq unique (profile_id, sort_order)
    deferrable initially deferred
);
create index idx_pfeat_tools_order on public.profile_featured_tools (profile_id, sort_order);
create index idx_pfeat_tools_tool  on public.profile_featured_tools (tool_id);

create table public.profile_featured_posts (
  profile_id uuid not null,
  post_id    uuid not null,
  sort_order smallint not null,
  created_at timestamptz not null default now(),
  primary key (profile_id, post_id),

  -- "You may only feature your own post", enforced by the database with no
  -- trigger. The target is posts_id_author_uniq from migration 3. profile_id
  -- needs no separate foreign key to profiles: this one already implies the
  -- author row exists, and it cascades when the author's posts cascade.
  constraint pfeat_posts_own_post
    foreign key (post_id, profile_id)
    references public.posts (id, author_id) on delete cascade,

  constraint pfeat_posts_order_ok check (sort_order between 1 and 12),
  constraint pfeat_posts_order_uniq unique (profile_id, sort_order)
    deferrable initially deferred
);
create index idx_pfeat_posts_order on public.profile_featured_posts (profile_id, sort_order);

-- ---------------------------------------------------------------------------
-- Flat caps. Without these a client can insert fifty thousand favourites,
-- which is an unbounded write against a table anyone can read.
-- ---------------------------------------------------------------------------
create trigger pft_cap before insert on public.profile_favorite_tools
  for each row execute function public.tg_enforce_owner_cap('profile_id', 'favorite_tools');
create trigger pfm_cap before insert on public.profile_favorite_models
  for each row execute function public.tg_enforce_owner_cap('profile_id', 'favorite_models');
create trigger pfeat_tools_cap before insert on public.profile_featured_tools
  for each row execute function public.tg_enforce_owner_cap('profile_id', 'featured_tools');
create trigger pfeat_posts_cap before insert on public.profile_featured_posts
  for each row execute function public.tg_enforce_owner_cap('profile_id', 'featured_posts');

-- ---------------------------------------------------------------------------
-- RLS and grants. All four are public profile decoration: readable by anyone,
-- writable only by their owner.
-- ---------------------------------------------------------------------------
alter table public.profile_favorite_tools  enable row level security;
alter table public.profile_favorite_models enable row level security;
alter table public.profile_featured_tools  enable row level security;
alter table public.profile_featured_posts  enable row level security;

create policy pft_select_all on public.profile_favorite_tools
  for select to anon, authenticated using (true);
create policy pft_write_own on public.profile_favorite_tools
  for all to authenticated
  using (auth.uid() = profile_id) with check (auth.uid() = profile_id);

create policy pfm_select_all on public.profile_favorite_models
  for select to anon, authenticated using (true);
create policy pfm_write_own on public.profile_favorite_models
  for all to authenticated
  using (auth.uid() = profile_id) with check (auth.uid() = profile_id);

create policy pfeat_tools_select_all on public.profile_featured_tools
  for select to anon, authenticated using (true);
create policy pfeat_tools_write_own on public.profile_featured_tools
  for all to authenticated
  using (auth.uid() = profile_id) with check (auth.uid() = profile_id);

create policy pfeat_posts_select_all on public.profile_featured_posts
  for select to anon, authenticated using (true);
create policy pfeat_posts_write_own on public.profile_featured_posts
  for all to authenticated
  using (auth.uid() = profile_id) with check (auth.uid() = profile_id);

revoke all on public.profile_favorite_tools  from public, anon, authenticated;
revoke all on public.profile_favorite_models from public, anon, authenticated;
revoke all on public.profile_featured_tools  from public, anon, authenticated;
revoke all on public.profile_featured_posts  from public, anon, authenticated;

grant select (profile_id, tool_id, created_at)  on public.profile_favorite_tools  to anon, authenticated;
grant insert (profile_id, tool_id)              on public.profile_favorite_tools  to authenticated;
grant delete                                    on public.profile_favorite_tools  to authenticated;

grant select (profile_id, model_id, created_at) on public.profile_favorite_models to anon, authenticated;
grant insert (profile_id, model_id)             on public.profile_favorite_models to authenticated;
grant delete                                    on public.profile_favorite_models to authenticated;

-- UPDATE is granted on sort_order alone, so a reorder cannot silently rewrite
-- profile_id or the target id.
grant select (profile_id, tool_id, sort_order, created_at) on public.profile_featured_tools to anon, authenticated;
grant insert (profile_id, tool_id, sort_order)             on public.profile_featured_tools to authenticated;
grant update (sort_order)                                  on public.profile_featured_tools to authenticated;
grant delete                                               on public.profile_featured_tools to authenticated;

grant select (profile_id, post_id, sort_order, created_at) on public.profile_featured_posts to anon, authenticated;
grant insert (profile_id, post_id, sort_order)             on public.profile_featured_posts to authenticated;
grant update (sort_order)                                  on public.profile_featured_posts to authenticated;
grant delete                                               on public.profile_featured_posts to authenticated;
