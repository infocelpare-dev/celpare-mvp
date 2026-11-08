-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260924101821. History: never edit.

-- Community Intelligence, phase 1: the two things the existing schema cannot hold.
--
-- feed_feedback: a person's negative feedback on the feed. Before this, "not
-- interested" existed only as a video event and mute did not exist at all.
-- feed_events: impressions, opens and dwell for posts shown OUTSIDE the video
-- viewer, carrying the algorithm version, variant and reason that produced them.
-- post_video_events is left untouched and keeps owning everything inside the viewer.

create table public.feed_feedback (
  user_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null check (target_type in ('post', 'author', 'topic')),
  target_id uuid not null,
  kind text not null check (kind in ('not_interested', 'mute')),
  created_at timestamptz not null default now(),
  primary key (user_id, target_type, target_id, kind),
  constraint feed_feedback_shape check (
    (target_type = 'post' and kind = 'not_interested')
    or (target_type in ('author', 'topic') and kind = 'mute')
  )
);

comment on table public.feed_feedback is
  'A person''s own negative feedback on the community feed: not interested in a post, mute an author, mute a topic. Reduces exposure in ranking; never deletes or hides content for anybody else.';

create index feed_feedback_user_recent on public.feed_feedback (user_id, created_at desc);
create index feed_feedback_post_target on public.feed_feedback (target_id) where target_type = 'post';

alter table public.feed_feedback enable row level security;

revoke all on public.feed_feedback from public, anon, authenticated;
grant select, insert, delete on public.feed_feedback to authenticated;

create policy feed_feedback_select_own on public.feed_feedback
  for select to authenticated using ((select auth.uid()) = user_id);
create policy feed_feedback_insert_own on public.feed_feedback
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy feed_feedback_delete_own on public.feed_feedback
  for delete to authenticated using ((select auth.uid()) = user_id);

create table public.feed_events (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  session_id text check (session_id is null or char_length(session_id) between 8 and 64),
  surface text not null check (surface in ('for_you', 'following', 'topic', 'trending', 'profile', 'post')),
  event text not null check (event in ('impression', 'open', 'dwell')),
  position smallint check (position is null or position between 0 and 500),
  dwell_ms integer check (dwell_ms is null or dwell_ms between 0 and 86400000),
  algorithm text check (algorithm is null or algorithm ~ '^[a-z]+(_[a-z]+)*_v[0-9]+$'),
  variant text check (variant is null or variant ~ '^[a-z0-9_]{1,40}$'),
  reason text check (reason is null or reason ~ '^[a-z_]{1,40}$'),
  created_at timestamptz not null default now()
);

comment on table public.feed_events is
  'Impressions, opens and dwell for posts shown in the feed, with the algorithm version, experiment variant and reason code that placed them. Written only by the server with the service role; no client grant, no policy. Video watching stays in post_video_events.';

create index feed_events_post_recent on public.feed_events (post_id, created_at desc);
create index feed_events_user_recent on public.feed_events (user_id, created_at desc) where user_id is not null;
create index feed_events_algorithm on public.feed_events (algorithm, variant, created_at desc);

alter table public.feed_events enable row level security;
revoke all on public.feed_events from public, anon, authenticated;
