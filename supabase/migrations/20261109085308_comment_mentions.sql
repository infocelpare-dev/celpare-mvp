-- Mentions in comments (founder, 2026-11-09: "add mentions").
--
-- Posts already turn @username into post_mentions and a 'mention' notification
-- (tg_post_intake, tg_notify_mention). Comments had nothing. This mirrors that
-- for comments, with the same rule for what counts as a mention: @ followed by
-- 2 to 30 letters, digits or underscores, matched case insensitively against
-- profiles.username, at most 10 per comment, never yourself.
--
-- The person a comment already notifies is skipped: the post's author on a top
-- level comment, the parent comment's author on a reply. They get 'comment' or
-- 'reply' for it, and a second notification for the same words is noise.
-- notify() applies the rest (mute, the Mentions switch in Settings).
--
-- Additive only. RLS on and no client grant, like post_mentions.

create table public.comment_mentions (
  comment_id uuid not null references public.comments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);
create index comment_mentions_user_idx on public.comment_mentions (user_id, created_at desc);

alter table public.comment_mentions enable row level security;
revoke all on public.comment_mentions from public, anon, authenticated;

create or replace function public.tg_comment_mentions()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_skip uuid;
  r record;
begin
  if new.status <> 'visible' or new.deleted_at is not null then return new; end if;

  if new.parent_id is null then
    select author_id into v_skip from public.posts where id = new.post_id;
  else
    select author_id into v_skip from public.comments where id = new.parent_id;
  end if;

  for r in
    select distinct pr.id
    from (
      select lower(m[1]) u
      from regexp_matches(coalesce(new.body, ''), '@([[:alnum:]_]{2,30})', 'g') m
      limit 10
    ) x
    /* extensions.citext: the type lives in the extensions schema, which this
       function's search_path does not include (tg_post_intake does the same). */
    join public.profiles pr on pr.username = x.u::extensions.citext
    where pr.id <> new.author_id
  loop
    insert into public.comment_mentions (comment_id, user_id)
    values (new.id, r.id)
    on conflict do nothing;

    if r.id is distinct from v_skip then
      perform public.notify(r.id, 'mention', new.author_id, new.post_id, new.id, null, '{}');
    end if;
  end loop;

  return new;
end $$;

revoke all on function public.tg_comment_mentions() from public, anon, authenticated;

create trigger comment_mentions after insert on public.comments
  for each row execute function public.tg_comment_mentions();
