-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20261005094428. History: never edit.

-- D203: a post can be published AS a tool (or, later, a model) rather than as
-- the person. The developer stays author_id, which keeps ownership, delete,
-- insights and notifications exactly as they are; posted_as decides whose name,
-- logo and page the post shows. Only launch_tool_feature sets it: it is in no
-- client insert or update grant, so nobody can post as a tool from the composer.

alter table public.posts
  add column posted_as text not null default 'person'
    check (posted_as in ('person', 'tool', 'model'));
alter table public.posts
  add constraint posts_posted_as_attachment
    check ((posted_as <> 'tool' or tool_id is not null) and (posted_as <> 'model' or model_id is not null));

grant select (posted_as) on public.posts to anon, authenticated;

-- Launches already shared from the tool page are the tool's.
update public.posts p set posted_as = 'tool'
  from public.tool_media m
 where m.post_id = p.id and p.tool_id is not null;

create or replace function public.launch_tool_feature(
  p_tool_id uuid,
  p_kind text,
  p_url text,
  p_caption text,
  p_link_url text,
  p_to_feed boolean default false,
  p_width integer default null,
  p_height integer default null,
  p_duration_ms integer default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_update uuid;
  v_post uuid;
  v_status text;
begin
  v_update := public.post_tool_update(p_tool_id, p_kind, p_url, p_caption, p_link_url);

  if coalesce(p_to_feed, false) then
    select status into v_status from public.tools where id = p_tool_id;
    if v_status <> 'approved' then
      raise exception 'tool_not_live' using errcode = 'P0001';
    end if;

    -- Published as the tool (D203): the feed shows the tool's name, logo and page.
    insert into public.posts (author_id, body, link_url, kind, tool_id, posted_as)
    values ((select auth.uid()), btrim(p_caption), nullif(btrim(p_link_url), ''), 'launch', p_tool_id, 'tool')
    returning id into v_post;

    if p_kind in ('screenshot', 'video') then
      insert into public.post_media (post_id, media_kind, url, width, height, duration_ms, sort_order)
      values (
        v_post,
        case when p_kind = 'video' then 'video' else 'image' end,
        btrim(p_url),
        p_width,
        p_height,
        case when p_kind = 'video' then p_duration_ms end,
        0
      );
    end if;

    update public.tool_media set post_id = v_post where id = v_update;
  end if;

  return jsonb_build_object('update_id', v_update, 'post_id', v_post);
end;
$$;
revoke all on function public.launch_tool_feature(uuid, text, text, text, text, boolean, integer, integer, integer) from public, anon;
grant execute on function public.launch_tool_feature(uuid, text, text, text, text, boolean, integer, integer, integer) to authenticated;
