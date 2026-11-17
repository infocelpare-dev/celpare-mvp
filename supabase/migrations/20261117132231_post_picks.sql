create table public.post_picks (
  post_id   uuid primary key references public.posts(id) on delete cascade,
  picked_by uuid not null references public.profiles(id),
  picked_at timestamptz not null default now()
);

create index post_picks_picked_at on public.post_picks (picked_at desc);

alter table public.post_picks enable row level security;

revoke all on public.post_picks from public, anon, authenticated;
grant select (post_id, picked_at) on public.post_picks to anon, authenticated;

create policy post_picks_select_all on public.post_picks
  for select to anon, authenticated
  using (true);

create or replace function public.admin_set_post_pick(
  p_post_id uuid, p_picked boolean, p_reason text default null
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_status text;
  v_label  text;
  v_before boolean;
begin
  perform public.admin_require('content.moderate');

  select status, left(body, 80) into v_status, v_label
    from public.posts where id = p_post_id and deleted_at is null;
  if v_status is null then raise exception 'post_not_found' using errcode = 'P0002'; end if;

  v_before := exists (select 1 from public.post_picks where post_id = p_post_id);

  if p_picked then
    if v_status <> 'visible' then
      raise exception 'post_not_visible' using errcode = 'P0001';
    end if;
    insert into public.post_picks (post_id, picked_by)
    values (p_post_id, (select auth.uid()))
    on conflict (post_id) do update set picked_at = now(), picked_by = excluded.picked_by;
  else
    delete from public.post_picks where post_id = p_post_id;
  end if;

  perform public.admin_audit(
    case when p_picked then 'post.picked' else 'post.unpicked' end,
    'post', p_post_id::text, v_label, p_reason,
    jsonb_build_object('picked', v_before), jsonb_build_object('picked', p_picked));
end;
$$;

revoke execute on function public.admin_set_post_pick(uuid, boolean, text) from public, anon;
grant execute on function public.admin_set_post_pick(uuid, boolean, text) to authenticated;
