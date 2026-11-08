-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260915132927. History: never edit.

-- The read side of 4Q.4. The tables are publicly readable, so this exists only
-- for the usage counts: how many tools sit in a category, how many posts carry
-- a topic. That is the number that decides whether a slug can be renamed
-- cheaply or whether renaming it breaks live URLs.

create or replace function public.admin_list_taxonomy(p_kind text)
returns table (
  id          uuid,
  slug        text,
  name        text,
  description text,
  sort_order  integer,
  created_at  timestamptz,
  uses        bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.admin_require('settings.manage');

  if p_kind = 'category' then
    return query
      select c.id, c.slug::text, c.name, c.description, c.sort_order, c.created_at,
             (select count(*) from public.tool_categories tc where tc.category_id = c.id)
        from public.categories c
       order by c.sort_order, c.name;
  elsif p_kind = 'topic' then
    return query
      select t.id, t.slug::text, t.name, t.description, t.sort_order, t.created_at,
             (select count(*) from public.posts p where p.topic_id = t.id and p.deleted_at is null)
        from public.topics t
       order by t.sort_order, t.name;
  else
    raise exception 'unknown taxonomy: %', p_kind using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.admin_list_taxonomy(text) from public, anon, authenticated;
grant execute on function public.admin_list_taxonomy(text) to authenticated;
