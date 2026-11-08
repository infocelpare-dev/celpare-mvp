-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260922111857. History: never edit.

-- Repost joins the closed event list.
--
-- The control did not exist when this table was created: `reposts` had a table
-- and a count and no way to write either, so there was nothing to record. There
-- is now, and the CHECK is the place that decides what an event may be.

alter table public.post_video_events
  drop constraint if exists post_video_events_event_check;

alter table public.post_video_events
  add constraint post_video_events_event_check check (event in (
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
    'repost',
    'profile_opened',
    'follow'
  ));
