-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260924113547. History: never edit.

-- Anybody who liked, commented on, reposted or saved a post saw it. Counting them as
-- viewers keeps views honest for posts engaged with before view tracking existed,
-- and means views can never read lower than likes.

create or replace function public.add_post_viewer(p_post uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_author uuid;
begin
  if p_post is null or p_user is null then return; end if;
  select author_id into v_author from public.posts where id = p_post;
  if v_author is null or v_author = p_user then return; end if;
  insert into public.post_viewers (post_id, viewer) values (p_post, 'u:' || p_user::text)
  on conflict do nothing;
  if found then
    update public.posts set view_count = view_count + 1 where id = p_post;
  end if;
end;
$$;
revoke all on function public.add_post_viewer(uuid, uuid) from public, anon, authenticated;

create or replace function public.tg_view_from_engagement()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_table_name = 'likes' then
    if new.entity_type = 'post' then perform public.add_post_viewer(new.entity_id, new.user_id); end if;
  elsif tg_table_name = 'saves' then
    if new.entity_type = 'post' then perform public.add_post_viewer(new.entity_id, new.user_id); end if;
  elsif tg_table_name = 'comments' then
    perform public.add_post_viewer(new.post_id, new.author_id);
  elsif tg_table_name = 'reposts' then
    perform public.add_post_viewer(new.post_id, new.user_id);
  elsif tg_table_name = 'user_collection_items' then
    if new.post_id is not null then
      perform public.add_post_viewer(new.post_id, (select user_id from public.user_collections where id = new.collection_id));
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.tg_view_from_engagement() from public, anon, authenticated;

create trigger likes_count_view after insert on public.likes for each row execute function public.tg_view_from_engagement();
create trigger saves_count_view after insert on public.saves for each row execute function public.tg_view_from_engagement();
create trigger comments_count_view after insert on public.comments for each row execute function public.tg_view_from_engagement();
create trigger reposts_count_view after insert on public.reposts for each row execute function public.tg_view_from_engagement();
create trigger collection_items_count_view after insert on public.user_collection_items for each row execute function public.tg_view_from_engagement();

-- Backfill from existing engagement.
insert into public.post_viewers (post_id, viewer, first_at)
select e.post_id, 'u:' || e.user_id::text, min(e.at)
from (
  select l.entity_id as post_id, l.user_id, l.created_at as at from public.likes l where l.entity_type = 'post'
  union all select s.entity_id, s.user_id, s.created_at from public.saves s where s.entity_type = 'post'
  union all select c.post_id, c.author_id, c.created_at from public.comments c
  union all select r.post_id, r.user_id, r.created_at from public.reposts r
  union all select ci.post_id, uc.user_id, ci.created_at from public.user_collection_items ci
    join public.user_collections uc on uc.id = ci.collection_id where ci.post_id is not null
) e
join public.posts p on p.id = e.post_id
where e.user_id is not null and e.user_id <> p.author_id
group by e.post_id, e.user_id
on conflict do nothing;

update public.posts p set view_count = coalesce(c.n, 0)
from (select id, (select count(*) from public.post_viewers v where v.post_id = posts.id)::int n from public.posts) c
where c.id = p.id;
