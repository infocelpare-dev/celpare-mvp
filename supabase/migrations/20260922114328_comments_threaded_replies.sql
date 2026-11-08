-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260922114328. History: never edit.

-- Replies to replies, to any depth.
--
-- 10-community.md said one level deep for v1 and the comment form said the same,
-- both noting that adding parent_id later would be additive rather than a rewrite.
-- This is that addition. Founder instruction 2026-09-22.
--
-- NULL means a top level comment. Everything else points at another comment.

alter table public.comments
  add column if not exists parent_id uuid references public.comments(id) on delete cascade;

-- Reading one post's thread, and finding a comment's children. Both are what the
-- tree builder does, and without the second a deep thread is a sequential scan
-- per node.
create index if not exists comments_parent_idx
  on public.comments (parent_id, created_at)
  where parent_id is not null;

create index if not exists comments_post_thread_idx
  on public.comments (post_id, created_at);

/*
  The parent has to be a real, live comment ON THE SAME POST.

  A CHECK constraint cannot express this because it needs a subquery, so it is a
  trigger, and it is SECURITY DEFINER with a pinned search_path like every other
  guard in this schema. Without it somebody could post a reply whose parent is a
  comment on a completely different post, and the tree builder would either drop
  it silently or, worse, graft one post's thread onto another's.

  A CYCLE IS IMPOSSIBLE and it is worth saying why rather than adding a walk to
  check for one. parent_id is set at INSERT and is deliberately absent from the
  UPDATE grant below, so a row's parent can never change. A new row can only point
  at a row that already exists, and a set of edges that only ever point backwards
  in time cannot contain a loop.
*/
create or replace function public.tg_comment_parent_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_parent_post uuid;
begin
  if new.parent_id is null then
    return new;
  end if;

  if new.parent_id = new.id then
    raise exception 'comment_parent_self' using errcode = '23514';
  end if;

  select c.post_id into v_parent_post
  from public.comments c
  where c.id = new.parent_id
    and c.deleted_at is null;

  if v_parent_post is null then
    raise exception 'comment_parent_missing' using errcode = '23503';
  end if;

  if v_parent_post <> new.post_id then
    raise exception 'comment_parent_other_post' using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.tg_comment_parent_guard() from public, anon, authenticated;

drop trigger if exists comments_parent_guard on public.comments;
create trigger comments_parent_guard
  before insert on public.comments
  for each row execute function public.tg_comment_parent_guard();

-- The column is invisible until granted, because this table grants per column
-- rather than per table. SELECT for both readers, INSERT for the author.
-- DELIBERATELY NO UPDATE GRANT: a reply cannot be re-parented after the fact,
-- which is half of why a cycle cannot exist.
grant select (parent_id) on public.comments to anon, authenticated;
grant insert (parent_id) on public.comments to authenticated;
