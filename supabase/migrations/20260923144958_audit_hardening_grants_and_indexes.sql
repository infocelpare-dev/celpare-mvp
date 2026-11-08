-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260923144958. History: never edit.

-- 1. Admin and staff routines: never callable signed out. Each already raises 42501
--    through admin_require(); this removes the door rather than relying on the lock.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (p.proname like 'admin\_%' or p.proname in ('is_admin','my_admin_role'))
  loop
    execute format('revoke execute on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated, service_role', r.sig);
  end loop;
end $$;

-- 2. A trigger function is fired by the trigger, never called. EXECUTE is only checked
--    when the trigger is created, so nobody needs it.
revoke execute on function public.tg_mirror_collection_save() from public, anon, authenticated;

-- 3. Pin search_path on the two functions the linter flagged.
alter function public.admin_rank(text) set search_path = public, pg_temp;
alter function public.tg_audit_append_only() set search_path = public, pg_temp;

-- 4. G41, the root cause. New tables and sequences in public no longer arrive granted
--    to anon and authenticated. Every table must be granted explicitly, which is what
--    the revoke before grant rule already required by hand.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;

-- 5. Duplicate index.
drop index if exists public.idx_reports_entity;

-- 6. Foreign keys with no covering index. Without one, deleting an account or a tool
--    scans every referencing table in full.
create index if not exists compare_events_user_idx            on public.compare_events (user_id);
create index if not exists compare_facts_attribute_idx        on public.compare_facts (attribute);
create index if not exists dm_messages_sender_idx             on public.dm_messages (sender_id);
create index if not exists dm_threads_created_by_idx          on public.dm_threads (created_by);
create index if not exists model_evaluations_benchmark_idx    on public.model_evaluations (benchmark_slug);
create index if not exists moderation_actions_actor_idx       on public.moderation_actions (actor_id);
create index if not exists moderation_actions_report_idx      on public.moderation_actions (report_id);
create index if not exists platform_settings_updated_by_idx   on public.platform_settings (updated_by);
create index if not exists post_video_events_user_idx         on public.post_video_events (user_id);
create index if not exists recommendation_events_user_idx     on public.recommendation_events (user_id);
create index if not exists search_result_events_user_idx      on public.search_result_events (user_id);
create index if not exists security_events_user_idx           on public.security_events (user_id);
create index if not exists tool_categories_category_idx       on public.tool_categories (category_id);
create index if not exists tool_reviews_user_idx              on public.tool_reviews (user_id);
create index if not exists tool_view_events_user_idx          on public.tool_view_events (user_id);
create index if not exists tools_domain_verified_by_idx       on public.tools (domain_verified_by);
create index if not exists user_collection_items_model_idx    on public.user_collection_items (model_id);
create index if not exists user_collection_items_post_idx     on public.user_collection_items (post_id);
