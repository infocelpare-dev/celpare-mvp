-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260927102927. History: never edit.

-- Compare Intelligence v1 (4BJ, D171). Existing kinds kept; missing kinds added; the algorithm that
-- produced the page recorded by the server. Old rows keep algorithm null (pre compare_v1).
alter table public.compare_events
  add column algorithm text check (algorithm is null or algorithm ~ '^compare_v[0-9]{1,3}$');

alter table public.compare_events drop constraint compare_events_event_check;
alter table public.compare_events add constraint compare_events_event_check check (event = any (array[
  'comparison_started','comparison_viewed','comparison_completed','comparison_abandoned',
  'item_added','item_removed','item_reordered','section_viewed','source_opened',
  'tool_opened_from_comparison','model_opened_from_comparison','save_comparison','share_comparison',
  'add_to_collection','ask_celpare_from_comparison','goal_selected',
  'preference_changed','dimension_expanded','scenario_changed',
  'recommendation_viewed','recommendation_clicked','recommendation_saved','recommendation_dismissed']));
