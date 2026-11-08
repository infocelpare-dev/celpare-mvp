-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260917191421. History: never edit.

-- tool_categories_select only ever allowed reading the categories of an
-- APPROVED tool. tool_links and tool_media never had that restriction, so the
-- three tables disagreed about who may read a submission's own parts.
--
-- Found building the edit form: an owner could not read back the categories of
-- their own draft, so the form would have loaded with every category unticked
-- and a save would have silently wiped them. My Tools has the same hole, which
-- is why a draft there has never shown its categories.
--
-- Public read still means approved and nothing else. This adds the owner, and
-- only for their own rows.
--
-- A plain EXISTS rather than may_edit_tool(), deliberately: that function also
-- tests the status, which is the very thing being worked around here, and it
-- would lock an owner out of reading a tool of theirs that is pending or
-- rejected. Reading what you submitted is not the same question as whether you
-- may still change it.

drop policy if exists tool_categories_select on public.tool_categories;

create policy tool_categories_select on public.tool_categories
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.tools t
      where t.id = tool_categories.tool_id
        and (
          t.status = 'approved'
          or t.developer_id = (select auth.uid())
        )
    )
  );
