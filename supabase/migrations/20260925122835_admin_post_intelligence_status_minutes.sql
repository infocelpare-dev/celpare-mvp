-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260925122835. History: never edit.

create or replace function public.admin_post_intelligence_status()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.admin_require('analytics.read');
  return jsonb_build_object(
    'config', (select config from public.post_intelligence_config),
    'last_tick', (select max(computed_at) from public.post_state),
    'minutes_since_tick', (select round(extract(epoch from now() - max(computed_at)) / 60)::integer from public.post_state),
    'stages', (select jsonb_object_agg(stage, n) from (select stage, count(*) n from public.post_state group by stage) x),
    'jobs', (select jsonb_agg(jsonb_build_object('name', j.jobname, 'schedule', j.schedule, 'active', j.active))
             from cron.job j where j.jobname like 'post-intelligence%'));
end $$;
revoke all on function public.admin_post_intelligence_status() from public, anon, authenticated;
grant execute on function public.admin_post_intelligence_status() to authenticated;
