-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260914091503. History: never edit.

-- Tracker task 4.4. Columns from 10-community.md section 6.
--
-- Tables, constraints and indexes only. Triggers are migration 4, policies and
-- grants are migration 5. RLS is on and every client grant is revoked here, so
-- a partial apply leaves these tables shut rather than open. That is the
-- correct failure mode.

-- ---------------------------------------------------------------------------
-- posts
-- ---------------------------------------------------------------------------
create table public.posts (
  id                     uuid primary key default gen_random_uuid(),
  author_id              uuid not null references public.profiles(id) on delete cascade,
  body                   text not null,
  link_url               text,
  topic_id               uuid references public.topics(id) on delete set null,
  like_count             integer not null default 0,
  comment_count          integer not null default 0,
  save_count             integer not null default 0,
  repost_count           integer not null default 0,
  score                  double precision not null default 0,
  status                 text not null default 'visible',
  report_count           integer not null default 0,
  qualified_report_count integer not null default 0,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  deleted_at             timestamptz,

  constraint posts_body_len check (char_length(body) between 1 and 2000),
  constraint posts_link_url_ok check (
    link_url is null
    or (char_length(link_url) <= 2048 and link_url ~ '^https?://[^[:space:]]+$')),
  constraint posts_status_ok check (status in ('visible', 'hidden', 'removed')),
  constraint posts_counts_ok check (
    like_count >= 0 and comment_count >= 0 and save_count >= 0
    and repost_count >= 0 and report_count >= 0 and qualified_report_count >= 0),

  -- Target for the composite foreign key from profile_featured_posts in
  -- migration 7. That is what makes "you may only feature your own post" a
  -- database rule rather than a trigger.
  constraint posts_id_author_uniq unique (id, author_id)
);

comment on column public.posts.qualified_report_count is
  'Reports from accounts old enough and confirmed enough to count toward auto
   hide. D73. report_count stays the honest raw total.';

-- Feed by recency. The default sort until there is enough content to rank.
create index idx_posts_feed_new on public.posts (created_at desc)
  where deleted_at is null and status = 'visible';

-- Feed by score. The Top sort.
create index idx_posts_feed_top on public.posts (score desc, created_at desc)
  where deleted_at is null and status = 'visible';

-- One topic. /community/topic/[slug].
create index idx_posts_topic on public.posts (topic_id, created_at desc)
  where deleted_at is null and status = 'visible';

-- A person's posts by recency. The profile Posts tab.
-- Not filtered on status, because an owner viewing their own profile must see
-- their hidden posts, and filtering status in the heap is cheap next to the
-- author_id range scan.
create index idx_posts_author_recent on public.posts (author_id, created_at desc)
  where deleted_at is null;

-- The profile Media tab.
create index idx_posts_author_media on public.posts (author_id, created_at desc)
  where deleted_at is null and link_url is not null;

-- Moderation queue. A small partial index over rare rows.
create index idx_posts_moderation on public.posts (status, updated_at desc)
  where status <> 'visible';

-- updated_at fires on user edits only, never on a counter write. A counter
-- trigger bumping updated_at would make the edited timestamp lie, and would
-- churn idx_posts_moderation on every like.
create trigger posts_touch_updated_at
  before update of body, link_url, topic_id on public.posts
  for each row execute function public.touch_updated_at();

alter table public.posts enable row level security;
revoke all on public.posts from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- comments. One level deep, no parent_id in v1. Adding it later is additive.
-- ---------------------------------------------------------------------------
create table public.comments (
  id                     uuid primary key default gen_random_uuid(),
  post_id                uuid not null references public.posts(id) on delete cascade,
  author_id              uuid not null references public.profiles(id) on delete cascade,
  body                   text not null,
  like_count             integer not null default 0,
  status                 text not null default 'visible',
  report_count           integer not null default 0,
  qualified_report_count integer not null default 0,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  deleted_at             timestamptz,

  constraint comments_body_len  check (char_length(body) between 1 and 1000),
  constraint comments_status_ok check (status in ('visible', 'hidden', 'removed')),
  constraint comments_counts_ok check (
    like_count >= 0 and report_count >= 0 and qualified_report_count >= 0)
);

-- A post's comments in thread order.
create index idx_comments_post on public.comments (post_id, created_at)
  where deleted_at is null;

-- A person's comments by recency. The profile Replies tab.
create index idx_comments_author_recent on public.comments (author_id, created_at desc)
  where deleted_at is null;

create index idx_comments_moderation on public.comments (status, updated_at desc)
  where status <> 'visible';

create trigger comments_touch_updated_at
  before update of body on public.comments
  for each row execute function public.touch_updated_at();

alter table public.comments enable row level security;
revoke all on public.comments from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- likes. The composite primary key IS the idempotency, not application logic.
--
-- Polymorphic with no foreign key on entity_id. That is acceptable here only
-- because both targets are soft delete only, so a dangling id cannot arise
-- through any client path. Contrast profile_favorite_tools in migration 7,
-- where the target can be hard deleted and a real foreign key is required.
-- ---------------------------------------------------------------------------
create table public.likes (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  entity_type text not null,
  entity_id   uuid not null,
  created_at  timestamptz not null default now(),
  primary key (user_id, entity_type, entity_id),
  constraint likes_entity_type_ok check (entity_type in ('post', 'comment'))
);

-- The primary key already answers "did I like these". This is the reverse
-- lookup, used by the counter reconciliation query and the profile Liked tab.
create index idx_likes_entity on public.likes (entity_type, entity_id);
create index idx_likes_user_recent on public.likes (user_id, created_at desc);

alter table public.likes enable row level security;
revoke all on public.likes from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- saves. Same shape as likes, posts only in v1, and PRIVATE.
--
-- This is the named trap in the spec. anon gets no grant and no policy at all,
-- and there is no cross user select of any kind, including for moderators.
-- ---------------------------------------------------------------------------
create table public.saves (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  entity_type text not null default 'post',
  entity_id   uuid not null,
  created_at  timestamptz not null default now(),
  primary key (user_id, entity_type, entity_id),
  constraint saves_entity_type_ok check (entity_type = 'post')
);

-- The primary key leads on user_id so it can range scan, but it cannot supply
-- the created_at ordering the profile Saved tab renders. Hence this.
create index idx_saves_user_recent on public.saves (user_id, created_at desc);
create index idx_saves_entity on public.saves (entity_type, entity_id);

alter table public.saves enable row level security;
revoke all on public.saves from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- reports
-- ---------------------------------------------------------------------------
create table public.reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  entity_type text not null,
  entity_id   uuid not null,
  reason      text not null,
  note        text,
  status      text not null default 'open',
  qualified   boolean not null default false,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at  timestamptz not null default now(),

  constraint reports_entity_type_ok check (entity_type in ('post', 'comment')),
  constraint reports_reason_ok check (
    reason in ('spam', 'abuse', 'offtopic', 'illegal', 'other')),
  constraint reports_note_len   check (note is null or char_length(note) <= 500),
  constraint reports_status_ok  check (status in ('open', 'upheld', 'dismissed')),

  -- Stops one person filing the same report fifty times to trip the threshold
  -- alone. It does not stop three people doing it, which is what D73 addresses.
  constraint reports_one_per_user unique (reporter_id, entity_type, entity_id)
);

comment on column public.reports.qualified is
  'Whether this report counted toward auto hide. Set by the trigger from the
   reporter account age and email confirmation. D73.';

create index idx_reports_entity on public.reports (entity_type, entity_id);
create index idx_reports_queue on public.reports (created_at) where status = 'open';

-- Foreign key index, so the Supabase performance advisor stays clean.
create index idx_reports_resolved_by on public.reports (resolved_by);

alter table public.reports enable row level security;
revoke all on public.reports from public, anon, authenticated;
