-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20261005085715. History: never edit.

-- D202: Launch a new feature from the tool page, with a choice of where it
-- appears: the tool page only, or the tool page and the community feed. Both in
-- one transaction, so a launch is never half published.

alter table public.tool_media
  add column post_id uuid references public.posts(id) on delete set null;

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
  -- Every check of the tool page launch (owner, active developer, kind,
  -- caption, media or link) lives in post_tool_update; reuse it, never copy it.
  v_update := public.post_tool_update(p_tool_id, p_kind, p_url, p_caption, p_link_url);

  if coalesce(p_to_feed, false) then
    select status into v_status from public.tools where id = p_tool_id;
    -- The feed is public: a post must never point at a listing the public
    -- cannot open.
    if v_status <> 'approved' then
      raise exception 'tool_not_live' using errcode = 'P0001';
    end if;

    insert into public.posts (author_id, body, link_url, kind, tool_id)
    values ((select auth.uid()), btrim(p_caption), nullif(btrim(p_link_url), ''), 'launch', p_tool_id)
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
