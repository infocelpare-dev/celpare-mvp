-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260917172056. History: never edit.

-- The developer submission form writes a tool's links, media and categories.
-- None of those three writes was possible before this migration.
--
-- tool_links and tool_media got their ALL policy gated by may_edit_tool() in
-- 4U.1, and the GRANTS were never matched to it: authenticated held SELECT and
-- DELETE and no INSERT. A policy without a grant never runs, so the submission
-- form could not have saved a single link or media row. Rule 6 again, in its
-- other direction: the default ACL gave away too much on the new tables, the
-- narrowing that followed took away too much, and nothing exercised the write.
--
-- tool_categories had no write policy and no write grant at all, so a category
-- could only ever be attached by hand in SQL.
--
-- Revoke before grant, every time, so nothing inherited from pg_default_acl
-- survives underneath what this names.

revoke all on public.tool_links from anon, authenticated;
revoke all on public.tool_media from anon, authenticated;
revoke all on public.tool_categories from anon, authenticated;

-- Reads stay public, as they were: the profile page is readable signed out.
grant select on public.tool_links to anon, authenticated;
grant select on public.tool_media to anon, authenticated;
grant select on public.tool_categories to anon, authenticated;

-- Writes are column scoped. Nothing here can name a column that decides
-- ownership or state, because these tables have none: may_edit_tool() reads
-- the parent tool, which is where developer_id and status live.
grant insert (tool_id, kind, url), delete on public.tool_links to authenticated;
grant insert (tool_id, kind, url, caption, sort_order), delete
  on public.tool_media to authenticated;
grant insert (tool_id, category_id), delete
  on public.tool_categories to authenticated;

-- tool_categories now gets the write policy the other two already had. Same
-- function, so "may this person edit this tool" has exactly one definition and
-- a change to it reaches all three tables at once.
--
-- may_edit_tool() is SECURITY DEFINER and already executable by authenticated,
-- since tool_links and tool_media policies call it as the caller. Rule 7 is
-- satisfied by that, not by assumption.
drop policy if exists tool_categories_write on public.tool_categories;
create policy tool_categories_write on public.tool_categories
  for all to authenticated
  using (public.may_edit_tool(tool_id))
  with check (public.may_edit_tool(tool_id));
