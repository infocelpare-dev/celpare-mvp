-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260914092131. History: never edit.

-- Three performance findings from the advisor, all fixed here rather than
-- left for later, because there are zero rows today and this is the cheapest
-- this work will ever be.
--
-- 1. auth_rls_initplan, 35 policies. auth.uid() in a policy is re-evaluated
--    once per row. Wrapping it as (select auth.uid()) makes the planner treat
--    it as an InitPlan and evaluate it once per statement. Same semantics,
--    different plan.
--
-- 2. multiple_permissive_policies, 9 tables. Every permissive policy for a
--    role and action runs on every relevant query. Where several SELECT
--    policies applied to authenticated, they collapse into one policy with
--    OR. The anon policy stays separate throughout, because the combined
--    expression calls is_moderator() and anon has no EXECUTE on it. That
--    constraint is what forces the split by role rather than one policy for
--    both.
--
-- 3. unindexed_foreign_keys on profile_featured_posts. The primary key is
--    (profile_id, post_id) and the composite foreign key is (post_id,
--    profile_id), so the leading column is wrong and the key is uncovered.

-- ===========================================================================
-- posts: three SELECT policies for authenticated become one.
-- ===========================================================================
drop policy posts_select_public on public.posts;
drop policy posts_select_own on public.posts;
drop policy posts_select_moderator on public.posts;

create policy posts_select_anon on public.posts
  for select to anon
  using (status = 'visible' and deleted_at is null);

create policy posts_select_auth on public.posts
  for select to authenticated
  using (
    (status = 'visible' and deleted_at is null)
    or (select auth.uid()) = author_id
    or public.is_moderator()
  );

drop policy posts_insert_own on public.posts;
create policy posts_insert_own on public.posts
  for insert to authenticated
  with check ((select auth.uid()) = author_id);

drop policy posts_update_own on public.posts;
create policy posts_update_own on public.posts
  for update to authenticated
  using ((select auth.uid()) = author_id and deleted_at is null)
  with check ((select auth.uid()) = author_id);

-- ===========================================================================
-- comments
-- ===========================================================================
drop policy comments_select_public on public.comments;
drop policy comments_select_own on public.comments;
drop policy comments_select_moderator on public.comments;

create policy comments_select_anon on public.comments
  for select to anon
  using (
    status = 'visible'
    and deleted_at is null
    and exists (
      select 1 from public.posts p
      where p.id = comments.post_id
        and p.status = 'visible'
        and p.deleted_at is null
    )
  );

create policy comments_select_auth on public.comments
  for select to authenticated
  using (
    (status = 'visible'
     and deleted_at is null
     and exists (
       select 1 from public.posts p
       where p.id = comments.post_id
         and p.status = 'visible'
         and p.deleted_at is null
     ))
    or (select auth.uid()) = author_id
    or public.is_moderator()
  );

drop policy comments_insert_own on public.comments;
create policy comments_insert_own on public.comments
  for insert to authenticated
  with check (
    (select auth.uid()) = author_id
    and exists (
      select 1 from public.posts p
      where p.id = comments.post_id
        and p.status = 'visible'
        and p.deleted_at is null
    )
  );

drop policy comments_update_own on public.comments;
create policy comments_update_own on public.comments
  for update to authenticated
  using ((select auth.uid()) = author_id and deleted_at is null)
  with check ((select auth.uid()) = author_id);

-- ===========================================================================
-- likes, saves, follows, reposts: single owner policies, initplan only.
-- ===========================================================================
drop policy likes_select_own on public.likes;
drop policy likes_insert_own on public.likes;
drop policy likes_delete_own on public.likes;
create policy likes_select_own on public.likes
  for select to authenticated using ((select auth.uid()) = user_id);
create policy likes_insert_own on public.likes
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy likes_delete_own on public.likes
  for delete to authenticated using ((select auth.uid()) = user_id);

-- saves stays exactly as it was in shape: owner only, authenticated only, no
-- anon policy and no moderator policy. Only the initplan wrapper changes.
drop policy saves_select_own on public.saves;
drop policy saves_insert_own on public.saves;
drop policy saves_delete_own on public.saves;
create policy saves_select_own on public.saves
  for select to authenticated using ((select auth.uid()) = user_id);
create policy saves_insert_own on public.saves
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy saves_delete_own on public.saves
  for delete to authenticated using ((select auth.uid()) = user_id);

drop policy follows_insert_own on public.follows;
drop policy follows_delete_own on public.follows;
create policy follows_insert_own on public.follows
  for insert to authenticated with check ((select auth.uid()) = follower_id);
create policy follows_delete_own on public.follows
  for delete to authenticated using ((select auth.uid()) = follower_id);

drop policy reposts_insert_own on public.reposts;
drop policy reposts_delete_own on public.reposts;
create policy reposts_insert_own on public.reposts
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.posts p
      where p.id = reposts.post_id
        and p.status = 'visible'
        and p.deleted_at is null
    )
  );
create policy reposts_delete_own on public.reposts
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ===========================================================================
-- reports: two SELECT policies for authenticated become one.
-- ===========================================================================
drop policy reports_select_own on public.reports;
drop policy reports_select_moderator on public.reports;
drop policy reports_insert_own on public.reports;

create policy reports_select_auth on public.reports
  for select to authenticated
  using ((select auth.uid()) = reporter_id or public.is_moderator());

create policy reports_insert_own on public.reports
  for insert to authenticated
  with check ((select auth.uid()) = reporter_id);

-- ===========================================================================
-- Favourites and featured.
-- The FOR ALL write policy also covered SELECT, duplicating the select_all
-- policy for authenticated. Splitting the write policy by verb removes the
-- duplicate and says more precisely what is allowed.
-- ===========================================================================
drop policy pft_write_own on public.profile_favorite_tools;
create policy pft_insert_own on public.profile_favorite_tools
  for insert to authenticated with check ((select auth.uid()) = profile_id);
create policy pft_delete_own on public.profile_favorite_tools
  for delete to authenticated using ((select auth.uid()) = profile_id);

drop policy pfm_write_own on public.profile_favorite_models;
create policy pfm_insert_own on public.profile_favorite_models
  for insert to authenticated with check ((select auth.uid()) = profile_id);
create policy pfm_delete_own on public.profile_favorite_models
  for delete to authenticated using ((select auth.uid()) = profile_id);

drop policy pfeat_tools_write_own on public.profile_featured_tools;
create policy pfeat_tools_insert_own on public.profile_featured_tools
  for insert to authenticated with check ((select auth.uid()) = profile_id);
create policy pfeat_tools_update_own on public.profile_featured_tools
  for update to authenticated
  using ((select auth.uid()) = profile_id) with check ((select auth.uid()) = profile_id);
create policy pfeat_tools_delete_own on public.profile_featured_tools
  for delete to authenticated using ((select auth.uid()) = profile_id);

drop policy pfeat_posts_write_own on public.profile_featured_posts;
create policy pfeat_posts_insert_own on public.profile_featured_posts
  for insert to authenticated with check ((select auth.uid()) = profile_id);
create policy pfeat_posts_update_own on public.profile_featured_posts
  for update to authenticated
  using ((select auth.uid()) = profile_id) with check ((select auth.uid()) = profile_id);
create policy pfeat_posts_delete_own on public.profile_featured_posts
  for delete to authenticated using ((select auth.uid()) = profile_id);

-- Finding 3: cover the composite foreign key.
create index idx_pfeat_posts_fk on public.profile_featured_posts (post_id, profile_id);

-- ===========================================================================
-- Saved tools and collections
-- ===========================================================================
drop policy ust_select_own on public.user_saved_tools;
drop policy ust_insert_own on public.user_saved_tools;
drop policy ust_update_own on public.user_saved_tools;
drop policy ust_delete_own on public.user_saved_tools;
create policy ust_select_own on public.user_saved_tools
  for select to authenticated using ((select auth.uid()) = user_id);
create policy ust_insert_own on public.user_saved_tools
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy ust_update_own on public.user_saved_tools
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy ust_delete_own on public.user_saved_tools
  for delete to authenticated using ((select auth.uid()) = user_id);

drop policy uc_select_public on public.user_collections;
drop policy uc_select_own on public.user_collections;
drop policy uc_insert_own on public.user_collections;
drop policy uc_update_own on public.user_collections;

create policy uc_select_anon on public.user_collections
  for select to anon using (is_public and deleted_at is null);

create policy uc_select_auth on public.user_collections
  for select to authenticated
  using ((is_public and deleted_at is null) or (select auth.uid()) = user_id);

create policy uc_insert_own on public.user_collections
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy uc_update_own on public.user_collections
  for update to authenticated
  using ((select auth.uid()) = user_id and deleted_at is null)
  with check ((select auth.uid()) = user_id);

drop policy uci_select_public on public.user_collection_items;
drop policy uci_select_own on public.user_collection_items;
drop policy uci_write_own on public.user_collection_items;

create policy uci_select_anon on public.user_collection_items
  for select to anon
  using (exists (
    select 1 from public.user_collections c
    where c.id = user_collection_items.collection_id
      and c.is_public and c.deleted_at is null));

-- Visibility still follows the parent collection, always: public parent, or
-- own parent. An item cannot be read out from under its parent either way.
create policy uci_select_auth on public.user_collection_items
  for select to authenticated
  using (exists (
    select 1 from public.user_collections c
    where c.id = user_collection_items.collection_id
      and ((c.is_public and c.deleted_at is null)
           or c.user_id = (select auth.uid()))));

create policy uci_insert_own on public.user_collection_items
  for insert to authenticated
  with check (exists (
    select 1 from public.user_collections c
    where c.id = user_collection_items.collection_id
      and c.user_id = (select auth.uid()) and c.deleted_at is null));
create policy uci_update_own on public.user_collection_items
  for update to authenticated
  using (exists (
    select 1 from public.user_collections c
    where c.id = user_collection_items.collection_id
      and c.user_id = (select auth.uid()) and c.deleted_at is null))
  with check (exists (
    select 1 from public.user_collections c
    where c.id = user_collection_items.collection_id
      and c.user_id = (select auth.uid()) and c.deleted_at is null));
create policy uci_delete_own on public.user_collection_items
  for delete to authenticated
  using (exists (
    select 1 from public.user_collections c
    where c.id = user_collection_items.collection_id
      and c.user_id = (select auth.uid()) and c.deleted_at is null));

-- ===========================================================================
-- Pre-existing policies, same initplan fix. Shape unchanged, only the wrapper.
-- ===========================================================================
drop policy profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

drop policy ai_usage_select_own on public.ai_usage_records;
create policy ai_usage_select_own on public.ai_usage_records
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy conversations_own on public.conversations;
create policy conversations_own on public.conversations
  for all to authenticated
  using ((select auth.uid()) = user_id and deleted_at is null)
  with check ((select auth.uid()) = user_id);

drop policy messages_own on public.messages;
create policy messages_own on public.messages
  for all to authenticated
  using (exists (
    select 1 from public.conversations c
    where c.id = messages.conversation_id
      and c.user_id = (select auth.uid())
      and c.deleted_at is null))
  with check (exists (
    select 1 from public.conversations c
    where c.id = messages.conversation_id
      and c.user_id = (select auth.uid())
      and c.deleted_at is null));
