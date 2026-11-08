-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20261102174535. History: never edit.

-- Sign up answers as percentages (founder 2026-11-02): each question's
-- percentages divide by the accounts that answered THAT question, so the
-- summary now also counts who answered each one. Still counts only (D226).
create or replace function public.admin_onboarding_summary(p_days integer default 30)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_days integer := least(greatest(coalesce(p_days, 30), 1), 365);
  v_since timestamptz := now() - make_interval(days => v_days);
begin
  perform public.admin_require('analytics.read');

  return jsonb_build_object(
    'window_days', v_days,
    'totals', (
      select jsonb_build_object(
        'signups', (select count(*) from public.profiles where created_at > v_since),
        'started', count(*),
        'completed', count(*) filter (where completed_at is not null and not ('all' = any(skipped))),
        'skipped_all', count(*) filter (where 'all' = any(skipped)),
        'answered_heard', count(*) filter (where heard_from is not null),
        'answered_role', count(*) filter (where role is not null),
        'answered_goals', count(*) filter (where cardinality(goals) > 0),
        'answered_interests', count(*) filter (where cardinality(category_ids) > 0 or cardinality(topic_ids) > 0),
        'answered_tools', count(*) filter (where cardinality(tool_ids) > 0),
        'answered_ref', count(*) filter (where ref is not null))
      from public.user_onboarding where created_at > v_since),
    'heard_from', coalesce((
      select jsonb_agg(jsonb_build_object('key', heard_from, 'count', n) order by n desc)
      from (select heard_from, count(*) n from public.user_onboarding
            where created_at > v_since and heard_from is not null group by heard_from) s), '[]'::jsonb),
    'heard_other', coalesce((
      select jsonb_agg(jsonb_build_object('key', t, 'count', n) order by n desc)
      from (select lower(heard_from_other) t, count(*) n from public.user_onboarding
            where created_at > v_since and heard_from = 'other' and heard_from_other is not null
            group by lower(heard_from_other) order by count(*) desc limit 20) s), '[]'::jsonb),
    'refs', coalesce((
      select jsonb_agg(jsonb_build_object('key', ref, 'count', n) order by n desc)
      from (select ref, count(*) n from public.user_onboarding
            where created_at > v_since and ref is not null
            group by ref order by count(*) desc limit 25) s), '[]'::jsonb),
    'roles', coalesce((
      select jsonb_agg(jsonb_build_object('key', role, 'count', n) order by n desc)
      from (select role, count(*) n from public.user_onboarding
            where created_at > v_since and role is not null group by role) s), '[]'::jsonb),
    'goals', coalesce((
      select jsonb_agg(jsonb_build_object('key', g, 'count', n) order by n desc)
      from (select g, count(*) n from public.user_onboarding, unnest(goals) g
            where created_at > v_since group by g) s), '[]'::jsonb),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object('key', c.name, 'count', n) order by n desc)
      from (select cid, count(*) n from public.user_onboarding, unnest(category_ids) cid
            where created_at > v_since group by cid) s
      join public.categories c on c.id = s.cid), '[]'::jsonb),
    'topics', coalesce((
      select jsonb_agg(jsonb_build_object('key', t.name, 'count', n) order by n desc)
      from (select tid, count(*) n from public.user_onboarding, unnest(topic_ids) tid
            where created_at > v_since group by tid) s
      join public.topics t on t.id = s.tid), '[]'::jsonb),
    'tools', coalesce((
      select jsonb_agg(jsonb_build_object('key', t.name, 'count', n) order by n desc)
      from (select tid, count(*) n from public.user_onboarding, unnest(tool_ids) tid
            where created_at > v_since group by tid order by count(*) desc limit 20) s
      join public.tools t on t.id = s.tid), '[]'::jsonb));
end;
$function$;
