-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260915085214. History: never edit.

-- The community moderation lists need report_count and qualified_report_count,
-- and neither is in the client SELECT grant on posts or comments.
--
-- Found by testing: the admin page selected them through the ordinary session
-- and got 42501, the same trap recorded in docs/RESUME.md section 7, where a
-- narrowed grant broke search_tools.
--
-- The fix is NOT to grant those columns to authenticated. How many people have
-- reported a post is moderation signal: with it visible, somebody can watch
-- their own brigade land, and an author can tell whether a post is one report
-- away from being hidden. It stays invisible to clients.
--
-- So the moderation lists become capability checked RPCs, like every other read
-- the policies cannot express. Ordinary reads of posts and comments are
-- untouched and still go through RLS.

create or replace function public.admin_list_posts(
  p_status   text default null,
  p_reported boolean default false,
  p_limit    integer default 25,
  p_offset   integer default 0
) returns table (
  id uuid, author_id uuid, body text, link_url text, status text,
  like_count integer, comment_count integer, report_count integer,
  qualified_report_count integer, created_at timestamptz, deleted_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_lim integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_off integer := greatest(coalesce(p_offset, 0), 0);
begin
  perform public.admin_require('content.moderate');

  return query
  with base as (
    select p.*, count(*) over () as total_count
    from public.posts p
    where (p_status is null or p.status = p_status)
      and (not coalesce(p_reported, false) or p.report_count > 0)
    order by p.created_at desc
    limit v_lim offset v_off
  )
  select b.id, b.author_id, b.body, b.link_url, b.status, b.like_count,
         b.comment_count, b.report_count, b.qualified_report_count,
         b.created_at, b.deleted_at, b.total_count
  from base b;
end;
$$;

create or replace function public.admin_list_comments(
  p_status   text default null,
  p_reported boolean default false,
  p_limit    integer default 25,
  p_offset   integer default 0
) returns table (
  id uuid, post_id uuid, author_id uuid, body text, status text,
  like_count integer, report_count integer, qualified_report_count integer,
  created_at timestamptz, deleted_at timestamptz, total_count bigint
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_lim integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_off integer := greatest(coalesce(p_offset, 0), 0);
begin
  perform public.admin_require('content.moderate');

  return query
  with base as (
    select c.*, count(*) over () as total_count
    from public.comments c
    where (p_status is null or c.status = p_status)
      and (not coalesce(p_reported, false) or c.report_count > 0)
    order by c.created_at desc
    limit v_lim offset v_off
  )
  select b.id, b.post_id, b.author_id, b.body, b.status, b.like_count,
         b.report_count, b.qualified_report_count, b.created_at, b.deleted_at,
         b.total_count
  from base b;
end;
$$;

-- The report detail page reads the one item a report is about, and wants the
-- same two counters beside it.
create or replace function public.admin_get_content(
  p_entity_type text,
  p_entity_id   uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare v_out jsonb;
begin
  perform public.admin_require('content.moderate');

  if p_entity_type = 'post' then
    select to_jsonb(p) - 'score' into v_out from public.posts p where p.id = p_entity_id;
  elsif p_entity_type = 'comment' then
    select to_jsonb(c) into v_out from public.comments c where c.id = p_entity_id;
  else
    raise exception 'invalid_entity_type:%', p_entity_type using errcode = '22023';
  end if;

  return v_out;
end;
$$;

revoke execute on function public.admin_list_posts(text, boolean, integer, integer) from public;
revoke execute on function public.admin_list_comments(text, boolean, integer, integer) from public;
revoke execute on function public.admin_get_content(text, uuid) from public;
grant execute on function public.admin_list_posts(text, boolean, integer, integer) to authenticated;
grant execute on function public.admin_list_comments(text, boolean, integer, integer) to authenticated;
grant execute on function public.admin_get_content(text, uuid) to authenticated;
