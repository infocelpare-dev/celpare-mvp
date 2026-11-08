-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260922104412. History: never edit.

-- Watch signals for video posts.
--
-- CLOSED, the same shape search_result_events has and for the same reason (D88):
-- the service role writes, nothing else holds a grant, and no policy exists. These
-- rows are the raw material a future video ranking system reads, so an endpoint
-- the browser can write directly would let somebody manufacture their own watch
-- time and buy a position.
--
-- REVOKE BEFORE GRANT. pg_default_acl hands anon and authenticated everything on
-- every new table in public, so the revoke is not tidying up, it is the control.

create table if not exists public.post_video_events (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,

  -- Groups one anonymous person's events within a sitting. Not an identity and
  -- never joined to one: a signed out viewer has no account to attribute to, and
  -- without this every event from them is an island.
  session_id text check (session_id is null or char_length(session_id) between 8 and 64),

  event text not null check (event in (
    'impression',
    'started',
    'paused',
    'resumed',
    'completed',
    'progress',
    'swipe_next',
    'swipe_previous',
    'like',
    'comment_opened',
    'share',
    'save',
    'report',
    'not_interested',
    'profile_opened',
    'follow'
  )),

  -- Where it sat in the list it was shown in. Bounded here as well as in the
  -- route, so a direct call cannot write a position that means nothing.
  position smallint check (position is null or (position >= 0 and position <= 500)),

  -- Watch duration and percentage are MEASURES CARRIED ON AN EVENT, not events of
  -- their own. Storing "watched 30%" as its own row would need a second row to say
  -- when, and the two could disagree.
  watch_ms integer check (watch_ms is null or (watch_ms >= 0 and watch_ms <= 86400000)),
  percent_watched smallint check (percent_watched is null or (percent_watched between 0 and 100)),
  duration_ms integer check (duration_ms is null or (duration_ms >= 0 and duration_ms <= 86400000)),

  -- Which surface produced it. The viewer does not care where its list came from
  -- (the player takes videoPosts[]), so this is how a later ranker tells a feed
  -- tap from a following-only run without the player having to know.
  source text not null default 'video' check (source in ('feed', 'video', 'following', 'explore', 'profile')),

  created_at timestamptz not null default now()
);

-- Reading signals for one post, and sweeping by time. Both are what a ranking job
-- would do; neither is something a client can reach, because nothing grants it.
create index if not exists post_video_events_post_idx
  on public.post_video_events (post_id, created_at desc);

create index if not exists post_video_events_created_idx
  on public.post_video_events (created_at desc);

alter table public.post_video_events enable row level security;

revoke all on public.post_video_events from public;
revoke all on public.post_video_events from anon;
revoke all on public.post_video_events from authenticated;

grant select, insert, update, delete on public.post_video_events to service_role;
