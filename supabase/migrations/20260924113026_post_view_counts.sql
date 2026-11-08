-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260924113026. History: never edit.

-- Views, shown beside likes, comments, reposts, saves and shares (founder, 2026-09-24).
-- A view is a DISTINCT viewer: a signed in account, or a signed out browser session,
-- that had the post on screen (a feed impression: half the card for a second; or a
-- video impression in the viewer). The author's own views never count.
-- Who viewed stays private in post_viewers (no client grant). Only the number is public.

create table public.post_viewers (
  post_id uuid not null references public.posts(id) on delete cascade,
  viewer text not null check (char_length(viewer) between 3 and 80),
  first_at timestamptz not null default now(),
  primary key (post_id, viewer)
);

comment on table public.post_viewers is
  'Distinct viewers per post, the source of posts.view_count. Private: no client grant, no policy. Written only by triggers on feed_events and post_video_events.';

alter table public.post_viewers enable row level security;
revoke all on public.post_viewers from public, anon, authenticated;

alter table public.posts add column view_count integer not null default 0 check (view_count >= 0);
grant select (view_count) on public.posts to anon, authenticated;

create or replace function public.tg_count_post_view()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_viewer text;
  v_author uuid;
begin
  if new.event <> 'impression' then return new; end if;
  if new.user_id is not null then
    v_viewer := 'u:' || new.user_id::text;
  elsif new.session_id is not null then
    v_viewer := 's:' || new.session_id;
  else
    return new;
  end if;

  select author_id into v_author from public.posts where id = new.post_id;
  if v_author is null or v_author = new.user_id then return new; end if;

  insert into public.post_viewers (post_id, viewer) values (new.post_id, v_viewer)
  on conflict do nothing;
  if found then
    update public.posts set view_count = view_count + 1 where id = new.post_id;
  end if;
  return new;
end;
$$;

revoke all on function public.tg_count_post_view() from public, anon, authenticated;

create trigger feed_events_count_view after insert on public.feed_events
  for each row execute function public.tg_count_post_view();
create trigger post_video_events_count_view after insert on public.post_video_events
  for each row execute function public.tg_count_post_view();

-- Backfill from the impressions already recorded.
insert into public.post_viewers (post_id, viewer, first_at)
select e.post_id, e.viewer, min(e.created_at)
from (
  select f.post_id, coalesce('u:' || f.user_id::text, 's:' || f.session_id) as viewer, f.user_id, f.created_at
    from public.feed_events f where f.event = 'impression'
  union all
  select v.post_id, coalesce('u:' || v.user_id::text, 's:' || v.session_id), v.user_id, v.created_at
    from public.post_video_events v where v.event = 'impression'
) e
join public.posts p on p.id = e.post_id
where e.viewer is not null and (e.user_id is null or e.user_id <> p.author_id)
group by e.post_id, e.viewer
on conflict do nothing;

update public.posts p set view_count = c.n
from (select post_id, count(*)::int n from public.post_viewers group by 1) c
where c.post_id = p.id;
