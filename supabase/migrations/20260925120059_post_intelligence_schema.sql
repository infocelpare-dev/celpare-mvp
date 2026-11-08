-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260925120059. History: never edit.

-- 4BG Post Intelligence: what happens after a post is uploaded. Design in
-- docs/context/13-post-intelligence.md, decisions D142 to D146 and D148.
-- Every table: RLS on, no policy, no client grant. Every function revoked from
-- public and anon, then granted to exactly who needs it.

create extension if not exists pg_cron;

-- The one config the SQL tick reads. lib/community/intelligence/lifecycle.ts
-- holds the same object; the admin page says when they differ.
create table public.post_intelligence_config (
  id boolean primary key default true check (id),
  config jsonb not null,
  updated_at timestamptz not null default now()
);
insert into public.post_intelligence_config (config) values ('{
  "version": 1,
  "stale_minutes": 20,
  "active_days": 7,
  "snapshot_retention_days": 30,
  "k_pseudo": 10,
  "min_ref_rate": 0.02,
  "min_ref_hourly": 0.15,
  "new_creator_factor": 0.5,
  "test_viewers": 12,
  "test_max_hours": 48,
  "test_fail_viewers": 40,
  "test_fail_perf": 0.8,
  "promising_perf": 1.2,
  "accelerating_ratio": 1.5,
  "rising_ticks": 2,
  "trending_ratio": 2,
  "trending_participants": 3,
  "trending_max_negative": 0.05,
  "viral_ratio": 5,
  "viral_engagers": 6,
  "viral_diversity": 0.5,
  "peak_fraction": 0.8,
  "peak_ticks": 2,
  "flat_hours": 6,
  "cooling_to_long_tail_hours": 48,
  "suppress_viewers": 10,
  "suppress_negative": 0.08,
  "held_spam": 0.85,
  "held_pending_reports": 2,
  "wave_hold_ratio": 0.8,
  "wave_min_new_viewers": 5,
  "new_author_posts": 5,
  "units": {"like": 1, "comment": 2, "save": 2.5, "repost": 3, "share": 3, "complete": 1, "follow_after": 4}
}'::jsonb);

create table public.post_features (
  post_id uuid primary key references public.posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  content_hash text not null,
  hashtags text[] not null default '{}',
  mentions uuid[] not null default '{}',
  has_link boolean not null default false,
  media_kind text,
  language text,
  simhash bigint,
  token_count integer,
  video_duration_ms integer check (video_duration_ms is null or video_duration_ms between 0 and 86400000),
  quality real,
  spam_risk real,
  bait_risk real,
  duplicate_of uuid references public.posts(id) on delete set null,
  near_duplicate_of uuid references public.posts(id) on delete set null,
  near_duplicate_score real,
  processor_version smallint,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);
create index post_features_hash_idx on public.post_features (author_id, content_hash);
create index post_features_recent_idx on public.post_features (created_at desc);

create table public.post_state (
  post_id uuid primary key references public.posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  stage text not null default 'uploaded' check (stage in (
    'uploaded', 'held', 'testing', 'promising', 'accelerating', 'trending',
    'viral', 'peak', 'cooling', 'long_tail', 'suppressed')),
  stage_since timestamptz not null default now(),
  wave smallint not null default 0 check (wave between 0 and 4),
  new_author boolean not null default false,
  processed boolean not null default false,
  perf_score real,
  perf_at_wave real,
  wave_started_at timestamptz,
  wave_units_start real not null default 0,
  wave_viewers_start integer not null default 0,
  velocity real not null default 0,
  velocity_prev real not null default 0,
  reference_rate real,
  reference_hourly real,
  peak_velocity real not null default 0,
  peak_at timestamptz,
  rising_ticks smallint not null default 0,
  below_peak_ticks smallint not null default 0,
  milestones_sent integer[] not null default '{}',
  notices_sent smallint not null default 0,
  metrics jsonb not null default '{}',
  computed_at timestamptz not null default now(),
  version smallint not null default 1
);
create index post_state_stage_idx on public.post_state (stage, computed_at desc);
create index post_state_author_idx on public.post_state (author_id);

create table public.post_metrics_snapshots (
  post_id uuid not null references public.posts(id) on delete cascade,
  at timestamptz not null default now(),
  viewers integer not null default 0,
  impressions integer not null default 0,
  qualified integer not null default 0,
  dwell_avg real,
  video_starts integer not null default 0,
  watch_avg real,
  completions integer not null default 0,
  rewatches integer not null default 0,
  skips integer not null default 0,
  likes integer not null default 0,
  comments integer not null default 0,
  reposts integer not null default 0,
  shares integer not null default 0,
  saves integer not null default 0,
  follows integer not null default 0,
  profile_visits integer not null default 0,
  link_clicks integer not null default 0,
  media_opens integer not null default 0,
  not_interested integer not null default 0,
  hides integer not null default 0,
  reports integer not null default 0,
  units real not null default 0,
  engagers integer not null default 0,
  outside_engagers integer not null default 0,
  primary key (post_id, at)
);
create index post_metrics_snapshots_at_idx on public.post_metrics_snapshots (at);

create table public.post_lifecycle_events (
  id bigint generated always as identity primary key,
  post_id uuid not null references public.posts(id) on delete cascade,
  from_stage text,
  to_stage text not null,
  wave smallint not null,
  reason jsonb not null default '{}',
  at timestamptz not null default now()
);
create index post_lifecycle_events_post_idx on public.post_lifecycle_events (post_id, at);

create table public.creator_baselines (
  author_id uuid primary key references public.profiles(id) on delete cascade,
  posts_used integer not null,
  engagement_rate real,
  comment_rate real,
  share_rate real,
  save_rate real,
  follow_rate real,
  completion_rate real,
  units_per_hour real,
  updated_at timestamptz not null default now()
);

create table public.topic_velocity (
  topic_id uuid not null references public.topics(id) on delete cascade,
  "window" text not null check ("window" in ('1h', '24h', '7d')),
  units real not null default 0,
  posts integer not null default 0,
  participants integer not null default 0,
  viewers integer not null default 0,
  velocity real not null default 0,
  engagement_rate real,
  computed_at timestamptz not null default now(),
  primary key (topic_id, "window")
);

create table public.post_mentions (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index post_mentions_user_idx on public.post_mentions (user_id, created_at desc);

do $$
declare t text;
begin
  foreach t in array array['post_intelligence_config', 'post_features', 'post_state',
    'post_metrics_snapshots', 'post_lifecycle_events', 'creator_baselines',
    'topic_velocity', 'post_mentions']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
  end loop;
end $$;

-- Video duration measured by the browser at upload. post_media is granted
-- column by column (RESUME rule 12): SELECT for every reader, INSERT for authors.
alter table public.post_media
  add column duration_ms integer check (duration_ms is null or duration_ms between 0 and 86400000);
grant select (duration_ms) on public.post_media to anon, authenticated;
grant insert (duration_ms) on public.post_media to authenticated;

-- New viewer signals from the feed card, and the surfaces they come from.
alter table public.feed_events drop constraint feed_events_event_check;
alter table public.feed_events add constraint feed_events_event_check check (event = any (array[
  'impression', 'open', 'dwell', 'serve', 'link_click', 'share', 'profile_visit', 'media_open', 'hide']));
alter table public.feed_events drop constraint feed_events_surface_check;
alter table public.feed_events add constraint feed_events_surface_check check (surface = any (array[
  'for_you', 'following', 'topic', 'trending', 'profile', 'post', 'explore', 'search', 'video']));

-- The normalised text a content hash is taken of: case, punctuation and
-- spacing folded, so "Hello, world!" and "hello world" are one text.
create or replace function public.post_normalise_text(p text)
returns text language sql immutable set search_path = pg_catalog as $$
  select btrim(regexp_replace(regexp_replace(lower(coalesce(p, '')), '[^[:alnum:]#@/:.]+', ' ', 'g'), '\s+', ' ', 'g'));
$$;

-- Intake, at insert, so it cannot be skipped by any client path.
create or replace function public.tg_post_intake()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_hash text := encode(sha256(convert_to(public.post_normalise_text(new.body), 'UTF8')), 'hex');
  v_tags text[];
  v_mentions uuid[];
  v_dup uuid;
  v_prior integer;
begin
  select coalesce(array_agg(distinct lower(m[1])), '{}') into v_tags
  from (select regexp_matches(coalesce(new.body, ''), '#([[:alnum:]_]{2,40})', 'g') m limit 10) x;

  select coalesce(array_agg(distinct pr.id), '{}') into v_mentions
  from (select lower(m[1]) u from regexp_matches(coalesce(new.body, ''), '@([[:alnum:]_]{2,30})', 'g') m limit 10) x
  join public.profiles pr on pr.username = x.u::citext
  where pr.id <> new.author_id;

  -- An exact copy of the author's own post from the last seven days.
  select f.post_id into v_dup
  from public.post_features f join public.posts p on p.id = f.post_id
  where f.author_id = new.author_id and f.content_hash = v_hash and f.post_id <> new.id
    and p.deleted_at is null and f.created_at > now() - interval '7 days'
    and length(public.post_normalise_text(new.body)) > 0
  order by f.created_at desc limit 1;

  insert into public.post_features (post_id, author_id, content_hash, hashtags, mentions, has_link, media_kind, duplicate_of)
  values (new.id, new.author_id, v_hash, v_tags, v_mentions, new.link_url is not null,
          case when new.kind in ('video', 'image') then new.kind end, v_dup);

  insert into public.post_mentions (post_id, user_id)
  select new.id, unnest(v_mentions);

  select count(*) into v_prior from public.posts p
  where p.author_id = new.author_id and p.id <> new.id and p.deleted_at is null;

  insert into public.post_state (post_id, author_id, new_author)
  values (new.id, new.author_id,
          v_prior < ((select (config->>'new_author_posts')::int from public.post_intelligence_config)));

  insert into public.post_lifecycle_events (post_id, from_stage, to_stage, wave, reason)
  values (new.id, null, 'uploaded', 0, jsonb_build_object('new_author', v_prior < 5));
  return new;
end $$;

create trigger post_intake after insert on public.posts
  for each row execute function public.tg_post_intake();

-- What processing (server/upload.ts, with the service role) reports back. The
-- stage decision is made here, in one place, not by the caller.
create or replace function public.post_record_processing(
  p_post_id uuid, p_language text, p_simhash bigint, p_token_count integer,
  p_quality real, p_spam real, p_bait real, p_near_of uuid, p_near_score real,
  p_version smallint, p_duration_ms integer default null)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare
  cfg jsonb := (select config from public.post_intelligence_config);
  v_dup uuid;
  v_stage text;
  v_pending integer;
begin
  update public.post_features set
    language = left(p_language, 8), simhash = p_simhash, token_count = p_token_count,
    quality = p_quality, spam_risk = p_spam, bait_risk = p_bait,
    near_duplicate_of = p_near_of, near_duplicate_score = p_near_score,
    video_duration_ms = coalesce(p_duration_ms, video_duration_ms),
    processor_version = p_version, processed_at = now()
  where post_id = p_post_id
  returning duplicate_of into v_dup;
  if not found then return null; end if;

  select greatest(p.report_count - p.qualified_report_count, 0) into v_pending
  from public.posts p where p.id = p_post_id;

  v_stage := case
    when coalesce(p_spam, 0) >= (cfg->>'held_spam')::real then 'held'
    when v_dup is not null then 'held'
    when coalesce(v_pending, 0) >= (cfg->>'held_pending_reports')::int then 'held'
    else 'testing' end;

  update public.post_state s set
    processed = true,
    stage = case when s.stage = 'uploaded' then v_stage else s.stage end,
    stage_since = case when s.stage = 'uploaded' then now() else s.stage_since end,
    wave_started_at = coalesce(s.wave_started_at, now()),
    computed_at = now()
  where s.post_id = p_post_id and s.stage = 'uploaded';

  if found then
    insert into public.post_lifecycle_events (post_id, from_stage, to_stage, wave, reason)
    values (p_post_id, 'uploaded', v_stage, 0, jsonb_build_object(
      'spam', p_spam, 'bait', p_bait, 'duplicate_of', v_dup, 'pending_reports', v_pending,
      'near_duplicate_of', p_near_of, 'near_score', p_near_score, 'language', p_language));
  else
    update public.post_state set processed = true where post_id = p_post_id;
  end if;
  return v_stage;
end $$;

-- Simhashes to compare a new post with: the author's own recent posts and
-- everybody's from the last seven days.
create or replace function public.post_simhash_candidates(p_post_id uuid)
returns table(post_id uuid, author_id uuid, simhash bigint)
language sql stable security definer set search_path = public, pg_temp as $$
  with me as (select f.author_id from public.post_features f where f.post_id = p_post_id)
  (select f.post_id, f.author_id, f.simhash from public.post_features f, me
    where f.simhash is not null and f.post_id <> p_post_id and f.author_id = me.author_id
    order by f.created_at desc limit 50)
  union
  (select f.post_id, f.author_id, f.simhash from public.post_features f
    join public.posts p on p.id = f.post_id
    where f.simhash is not null and f.post_id <> p_post_id and p.deleted_at is null
      and f.created_at > now() - interval '7 days'
    order by f.created_at desc limit 1000);
$$;

-- One row per post of cumulative counts, built on feed_post_signals so the
-- two can never disagree about what a signal is.
create or replace function public.post_signal_totals(p_ids uuid[])
returns table(post_id uuid, viewers integer, impressions integer, qualified integer,
  dwell_avg real, video_starts integer, watch_avg real, completions integer,
  rewatches integer, skips integer, likes integer, comments integer, author_replies integer,
  reposts integer, shares integer, saves integer, follows integer, profile_visits integer,
  link_clicks integer, media_opens integer, not_interested integer, hides integer,
  reports integer, units real, units_1h real, units_1_6h real,
  participants_24h integer, engagers_6h integer)
language sql stable security definer set search_path = public, pg_temp as $$
  with s as (select * from public.feed_post_signals(p_ids)),
  u as (select config->'units' w from public.post_intelligence_config),
  a as (
    select s.post_id,
      coalesce(max(s.uniq) filter (where s.signal = 'impression' and s.bucket = 9), 0) viewers,
      coalesce(max(s.n) filter (where s.signal = 'impression' and s.bucket = 9), 0) impressions,
      greatest(
        coalesce(max(s.uniq) filter (where s.signal = 'open' and s.bucket = 9), 0),
        coalesce(max(s.uniq) filter (where s.signal = 'dwell' and s.bucket = 9), 0),
        coalesce(max(s.uniq) filter (where s.signal = 'video_start' and s.bucket = 9), 0)) qualified,
      max(s.value) filter (where s.signal = 'dwell' and s.bucket = 9) dwell_avg,
      coalesce(max(s.uniq) filter (where s.signal = 'video_start' and s.bucket = 9), 0) video_starts,
      max(s.value) filter (where s.signal = 'watch' and s.bucket = 9) watch_avg,
      coalesce(max(s.uniq) filter (where s.signal = 'complete' and s.bucket = 9), 0) completions,
      coalesce(max(s.uniq) filter (where s.signal = 'rewatch' and s.bucket = 9), 0) rewatches,
      coalesce(max(s.uniq) filter (where s.signal = 'skip' and s.bucket = 9), 0) skips,
      coalesce(max(s.uniq) filter (where s.signal = 'like' and s.bucket = 9), 0) likes,
      coalesce(max(s.uniq) filter (where s.signal = 'comment' and s.bucket = 9), 0) comments,
      coalesce(max(s.uniq) filter (where s.signal = 'author_reply' and s.bucket = 9), 0) author_replies,
      coalesce(max(s.uniq) filter (where s.signal = 'repost' and s.bucket = 9), 0) reposts,
      coalesce(max(s.uniq) filter (where s.signal = 'share' and s.bucket = 9), 0) shares,
      coalesce(max(s.uniq) filter (where s.signal = 'save' and s.bucket = 9), 0) saves,
      coalesce(max(s.uniq) filter (where s.signal = 'follow_after' and s.bucket = 9), 0) follows,
      coalesce(max(s.uniq) filter (where s.signal = 'profile_visit' and s.bucket = 9), 0) profile_visits,
      coalesce(max(s.uniq) filter (where s.signal = 'link_click' and s.bucket = 9), 0) link_clicks,
      coalesce(max(s.uniq) filter (where s.signal = 'media_open' and s.bucket = 9), 0) media_opens,
      coalesce(max(s.uniq) filter (where s.signal = 'not_interested' and s.bucket = 9), 0) not_interested,
      coalesce(max(s.uniq) filter (where s.signal = 'hide' and s.bucket = 9), 0) hides,
      coalesce(max(s.uniq) filter (where s.signal = 'report' and s.bucket = 9), 0) reports,
      coalesce(sum(s.uniq * coalesce((u.w->>s.signal)::real, 0)) filter (where s.bucket = 9), 0) units,
      coalesce(sum(s.uniq * coalesce((u.w->>s.signal)::real, 0)) filter (where s.bucket = 0), 0) units_1h,
      coalesce(sum(s.uniq * coalesce((u.w->>s.signal)::real, 0)) filter (where s.bucket = 1), 0) units_1_6h,
      coalesce(sum(s.uniq) filter (where s.bucket between 0 and 2
        and s.signal in ('like', 'comment', 'repost', 'save', 'share', 'complete')), 0) participants_24h,
      coalesce(sum(s.uniq) filter (where s.bucket between 0 and 1
        and s.signal in ('like', 'comment', 'repost', 'save', 'share')), 0) engagers_6h
    from s cross join u
    group by s.post_id
  )
  select p.id,
    greatest(coalesce(a.viewers, 0), p.view_count)::integer,
    coalesce(a.impressions, 0)::integer, coalesce(a.qualified, 0)::integer, a.dwell_avg,
    coalesce(a.video_starts, 0)::integer, a.watch_avg, coalesce(a.completions, 0)::integer,
    coalesce(a.rewatches, 0)::integer, coalesce(a.skips, 0)::integer, coalesce(a.likes, 0)::integer,
    coalesce(a.comments, 0)::integer, coalesce(a.author_replies, 0)::integer,
    coalesce(a.reposts, 0)::integer, coalesce(a.shares, 0)::integer, coalesce(a.saves, 0)::integer,
    coalesce(a.follows, 0)::integer, coalesce(a.profile_visits, 0)::integer,
    coalesce(a.link_clicks, 0)::integer, coalesce(a.media_opens, 0)::integer,
    coalesce(a.not_interested, 0)::integer, coalesce(a.hides, 0)::integer,
    coalesce(a.reports, 0)::integer, coalesce(a.units, 0)::real, coalesce(a.units_1h, 0)::real,
    coalesce(a.units_1_6h, 0)::real, coalesce(a.participants_24h, 0)::integer,
    coalesce(a.engagers_6h, 0)::integer
  from public.posts p left join a on a.post_id = p.id
  where p.id = any (p_ids[1:500]);
$$;

revoke all on function public.post_normalise_text(text) from public, anon, authenticated;
revoke all on function public.tg_post_intake() from public, anon, authenticated;
revoke all on function public.post_record_processing(uuid, text, bigint, integer, real, real, real, uuid, real, smallint, integer) from public, anon, authenticated;
revoke all on function public.post_simhash_candidates(uuid) from public, anon, authenticated;
revoke all on function public.post_signal_totals(uuid[]) from public, anon, authenticated;
grant execute on function public.post_record_processing(uuid, text, bigint, integer, real, real, real, uuid, real, smallint, integer) to service_role;
grant execute on function public.post_simhash_candidates(uuid) to service_role;
grant execute on function public.post_signal_totals(uuid[]) to service_role;

-- Backfill the posts that existed before intake: features from the same
-- normaliser, state from their age. They were never processed, so the tick's
-- recovery treats them like any post whose processing failed.
insert into public.post_features (post_id, author_id, content_hash, hashtags, has_link, media_kind, created_at)
select p.id, p.author_id,
  encode(sha256(convert_to(public.post_normalise_text(p.body), 'UTF8')), 'hex'),
  coalesce((select array_agg(distinct lower(m[1])) from regexp_matches(coalesce(p.body, ''), '#([[:alnum:]_]{2,40})', 'g') m), '{}'),
  p.link_url is not null, case when p.kind in ('video', 'image') then p.kind end, p.created_at
from public.posts p
on conflict do nothing;

insert into public.post_state (post_id, author_id, stage, stage_since, wave_started_at)
select p.id, p.author_id, 'uploaded', p.created_at, p.created_at from public.posts p
on conflict do nothing;
