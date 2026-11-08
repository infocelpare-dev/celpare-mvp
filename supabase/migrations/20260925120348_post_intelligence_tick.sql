-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260925120348. History: never edit.

-- 4BG: the lifecycle state machine, the tick that drives it, baselines, the
-- readers, and the schedules. docs/context/13-post-intelligence.md sections 3 to 7.

update public.post_intelligence_config set
  config = config || '{"default_platform_rate": 0.1, "default_platform_hourly": 0.3, "recover_minutes": 10}'::jsonb,
  updated_at = now();

-- Units in the 6 to 24 hour bucket too, for topic velocity over a day.
drop function public.post_signal_totals(uuid[]);
create function public.post_signal_totals(p_ids uuid[])
returns table(post_id uuid, viewers integer, impressions integer, qualified integer,
  dwell_avg real, video_starts integer, watch_avg real, completions integer,
  rewatches integer, skips integer, likes integer, comments integer, author_replies integer,
  reposts integer, shares integer, saves integer, follows integer, profile_visits integer,
  link_clicks integer, media_opens integer, not_interested integer, hides integer,
  reports integer, units real, units_1h real, units_1_6h real, units_6_24h real,
  participants_24h integer, engagers_6h integer)
language sql stable security definer set search_path = public, pg_temp as $$
  with s as (select * from public.feed_post_signals(p_ids)),
  u as (select config->'units' w from public.post_intelligence_config),
  a as (
    select s.post_id,
      coalesce(max(s.uniq) filter (where s.signal = 'impression' and s.bucket = 9), 0) viewers,
      coalesce(max(s.n) filter (where s.signal = 'impression' and s.bucket = 9), 0) impressions,
      greatest(
        coalesce(max(s.uniq) filter (where s.signal = 'open' and s.bucket = 9), 0),
        coalesce(max(s.uniq) filter (where s.signal = 'dwell' and s.bucket = 9), 0),
        coalesce(max(s.uniq) filter (where s.signal = 'video_start' and s.bucket = 9), 0)) qualified,
      max(s.value) filter (where s.signal = 'dwell' and s.bucket = 9) dwell_avg,
      coalesce(max(s.uniq) filter (where s.signal = 'video_start' and s.bucket = 9), 0) video_starts,
      max(s.value) filter (where s.signal = 'watch' and s.bucket = 9) watch_avg,
      coalesce(max(s.uniq) filter (where s.signal = 'complete' and s.bucket = 9), 0) completions,
      coalesce(max(s.uniq) filter (where s.signal = 'rewatch' and s.bucket = 9), 0) rewatches,
      coalesce(max(s.uniq) filter (where s.signal = 'skip' and s.bucket = 9), 0) skips,
      coalesce(max(s.uniq) filter (where s.signal = 'like' and s.bucket = 9), 0) likes,
      coalesce(max(s.uniq) filter (where s.signal = 'comment' and s.bucket = 9), 0) comments,
      coalesce(max(s.uniq) filter (where s.signal = 'author_reply' and s.bucket = 9), 0) author_replies,
      coalesce(max(s.uniq) filter (where s.signal = 'repost' and s.bucket = 9), 0) reposts,
      coalesce(max(s.uniq) filter (where s.signal = 'share' and s.bucket = 9), 0) shares,
      coalesce(max(s.uniq) filter (where s.signal = 'save' and s.bucket = 9), 0) saves,
      coalesce(max(s.uniq) filter (where s.signal = 'follow_after' and s.bucket = 9), 0) follows,
      coalesce(max(s.uniq) filter (where s.signal = 'profile_visit' and s.bucket = 9), 0) profile_visits,
      coalesce(max(s.uniq) filter (where s.signal = 'link_click' and s.bucket = 9), 0) link_clicks,
      coalesce(max(s.uniq) filter (where s.signal = 'media_open' and s.bucket = 9), 0) media_opens,
      coalesce(max(s.uniq) filter (where s.signal = 'not_interested' and s.bucket = 9), 0) not_interested,
      coalesce(max(s.uniq) filter (where s.signal = 'hide' and s.bucket = 9), 0) hides,
      coalesce(max(s.uniq) filter (where s.signal = 'report' and s.bucket = 9), 0) reports,
      coalesce(sum(s.uniq * coalesce((u.w->>s.signal)::real, 0)) filter (where s.bucket = 9), 0) units,
      coalesce(sum(s.uniq * coalesce((u.w->>s.signal)::real, 0)) filter (where s.bucket = 0), 0) units_1h,
      coalesce(sum(s.uniq * coalesce((u.w->>s.signal)::real, 0)) filter (where s.bucket = 1), 0) units_1_6h,
      coalesce(sum(s.uniq * coalesce((u.w->>s.signal)::real, 0)) filter (where s.bucket = 2), 0) units_6_24h,
      coalesce(sum(s.uniq) filter (where s.bucket between 0 and 2
        and s.signal in ('like', 'comment', 'repost', 'save', 'share', 'complete')), 0) participants_24h,
      coalesce(sum(s.uniq) filter (where s.bucket between 0 and 1
        and s.signal in ('like', 'comment', 'repost', 'save', 'share')), 0) engagers_6h
    from s cross join u
    group by s.post_id
  )
  select p.id,
    greatest(coalesce(a.viewers, 0), p.view_count)::integer,
    coalesce(a.impressions, 0)::integer, coalesce(a.qualified, 0)::integer, a.dwell_avg,
    coalesce(a.video_starts, 0)::integer, a.watch_avg, coalesce(a.completions, 0)::integer,
    coalesce(a.rewatches, 0)::integer, coalesce(a.skips, 0)::integer, coalesce(a.likes, 0)::integer,
    coalesce(a.comments, 0)::integer, coalesce(a.author_replies, 0)::integer,
    coalesce(a.reposts, 0)::integer, coalesce(a.shares, 0)::integer, coalesce(a.saves, 0)::integer,
    coalesce(a.follows, 0)::integer, coalesce(a.profile_visits, 0)::integer,
    coalesce(a.link_clicks, 0)::integer, coalesce(a.media_opens, 0)::integer,
    coalesce(a.not_interested, 0)::integer, coalesce(a.hides, 0)::integer,
    coalesce(a.reports, 0)::integer, coalesce(a.units, 0)::real, coalesce(a.units_1h, 0)::real,
    coalesce(a.units_1_6h, 0)::real, coalesce(a.units_6_24h, 0)::real,
    coalesce(a.participants_24h, 0)::integer, coalesce(a.engagers_6h, 0)::integer
  from public.posts p left join a on a.post_id = p.id
  where p.id = any (p_ids[1:500]);
$$;
revoke all on function public.post_signal_totals(uuid[]) from public, anon, authenticated;
grant execute on function public.post_signal_totals(uuid[]) to service_role;

/*
  The state machine. Pure: the same inputs always give the same answer, so it
  is tested by calling it with made up numbers (4BG.17). m carries the
  measurements, cfg the thresholds. Returns the next stage, wave and the rule
  that fired ('stay' when nothing did).
*/
create or replace function public.post_next_stage(
  p_stage text, p_wave integer, p_hours_in_stage real, p_age_hours real, m jsonb, cfg jsonb)
returns table(stage text, wave integer, rule text)
language plpgsql immutable set search_path = pg_catalog as $$
declare
  viewers integer := coalesce((m->>'viewers')::integer, 0);
  perf real := coalesce((m->>'perf')::real, 0);
  wave_perf real := (m->>'wave_perf')::real;
  perf_at_wave real := (m->>'perf_at_wave')::real;
  vel real := coalesce((m->>'vel')::real, 0);
  ref_h real := greatest(coalesce((m->>'ref_hourly')::real, 0), (cfg->>'min_ref_hourly')::real);
  rising integer := coalesce((m->>'rising_ticks')::integer, 0);
  below integer := coalesce((m->>'below_peak_ticks')::integer, 0);
  participants integer := coalesce((m->>'participants_24h')::integer, 0);
  engagers integer := coalesce((m->>'engagers_6h')::integer, 0);
  diversity real := coalesce((m->>'diversity')::real, 0);
  neg real := coalesce((m->>'neg')::real, 0);
  spam real := coalesce((m->>'spam')::real, 0);
  dup boolean := coalesce((m->>'duplicate')::boolean, false);
  pending integer := coalesce((m->>'pending_reports')::integer, 0);
  upheld integer := coalesce((m->>'qualified_reports')::integer, 0);
  cool_from integer := coalesce((m->>'cool_from_wave')::integer, p_wave);
begin
  -- Negative response or an upheld report, at any stage after processing.
  if p_stage not in ('uploaded', 'held') and (upheld > 0 or
     (viewers >= (cfg->>'suppress_viewers')::integer and neg >= (cfg->>'suppress_negative')::real)) then
    if p_stage = 'suppressed' then return query select p_stage, 0, 'stay'; return; end if;
    return query select 'suppressed'::text, 0, case when upheld > 0 then 'upheld_report' else 'negative_feedback' end;
    return;
  end if;

  if p_stage = 'uploaded' then return query select p_stage, p_wave, 'stay'; return; end if;

  if p_stage = 'suppressed' then
    if neg < (cfg->>'suppress_negative')::real / 2 then
      return query select 'cooling'::text, 0, 'recovered'; return;
    end if;
    return query select p_stage, 0, 'stay'; return;
  end if;

  if p_stage = 'held' then
    if spam < (cfg->>'held_spam')::real and not dup and pending < (cfg->>'held_pending_reports')::integer then
      return query select 'testing'::text, 0, 'released'; return;
    end if;
    return query select p_stage, 0, 'stay'; return;
  end if;

  -- A quiet post that takes off again.
  if p_stage in ('long_tail', 'cooling') and rising >= (cfg->>'rising_ticks')::integer
     and vel >= (cfg->>'accelerating_ratio')::real * ref_h
     and participants >= (cfg->>'trending_participants')::integer then
    return query select 'accelerating'::text, 2, 'resurgence'; return;
  end if;

  if p_stage in ('testing', 'promising', 'cooling') and p_age_hours >= (cfg->>'active_days')::real * 24 then
    return query select 'long_tail'::text, 0, 'age'; return;
  end if;

  -- The audience of this wave responded worse than the one that earned it:
  -- one step back, never straight to the start.
  if p_stage in ('promising', 'accelerating', 'trending', 'viral') and wave_perf is not null
     and perf_at_wave is not null and wave_perf < (cfg->>'wave_hold_ratio')::real * perf_at_wave then
    return query select
      (case p_stage when 'promising' then 'testing' when 'accelerating' then 'promising'
                    when 'trending' then 'accelerating' else 'trending' end)::text,
      greatest(p_wave - 1, 0), 'wave_underperformed';
    return;
  end if;

  case p_stage
  when 'testing' then
    if viewers >= (cfg->>'test_viewers')::integer and perf >= (cfg->>'promising_perf')::real then
      return query select 'promising'::text, 1, 'test_passed'; return;
    elsif p_age_hours >= (cfg->>'test_max_hours')::real
       or (viewers >= (cfg->>'test_fail_viewers')::integer and perf < (cfg->>'test_fail_perf')::real) then
      return query select 'long_tail'::text, 0, 'test_ended'; return;
    end if;
  when 'promising' then
    if rising >= (cfg->>'rising_ticks')::integer and vel >= (cfg->>'accelerating_ratio')::real * ref_h then
      return query select 'accelerating'::text, 2, 'speeding_up'; return;
    elsif p_hours_in_stage >= (cfg->>'flat_hours')::real and vel < ref_h then
      return query select 'cooling'::text, p_wave, 'flat'; return;
    end if;
  when 'accelerating' then
    if participants >= (cfg->>'trending_participants')::integer
       and vel >= (cfg->>'trending_ratio')::real * ref_h
       and neg < (cfg->>'trending_max_negative')::real then
      return query select 'trending'::text, 3, 'trending'; return;
    elsif below >= (cfg->>'peak_ticks')::integer then
      return query select 'peak'::text, p_wave, 'past_peak'; return;
    end if;
  when 'trending' then
    if vel >= (cfg->>'viral_ratio')::real * ref_h and engagers >= (cfg->>'viral_engagers')::integer
       and diversity >= (cfg->>'viral_diversity')::real then
      return query select 'viral'::text, 4, 'viral'; return;
    elsif below >= (cfg->>'peak_ticks')::integer then
      return query select 'peak'::text, p_wave, 'past_peak'; return;
    end if;
  when 'viral' then
    if below >= (cfg->>'peak_ticks')::integer then
      return query select 'peak'::text, p_wave, 'past_peak'; return;
    end if;
  when 'peak' then
    if vel < ref_h then
      return query select 'cooling'::text, p_wave, 'slowing'; return;
    end if;
  when 'cooling' then
    if p_hours_in_stage >= (cfg->>'cooling_to_long_tail_hours')::real then
      return query select 'long_tail'::text, 0, 'cooled'; return;
    end if;
    -- One wave fewer for every hour spent cooling.
    return query select p_stage, greatest(0, cool_from - floor(p_hours_in_stage)::integer),
      case when greatest(0, cool_from - floor(p_hours_in_stage)::integer) <> p_wave then 'cooling_step' else 'stay' end;
    return;
  else
    null;
  end case;

  return query select p_stage, p_wave, 'stay';
end $$;

create or replace function public.post_intelligence_tick()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  cfg jsonb := (select config from public.post_intelligence_config);
  v_ids uuid[];
  r record;
  n record;
  k real := (cfg->>'k_pseudo')::real;
  v_platform_rate real;
  v_platform_hourly real;
  v_c real; v_t real; v_ref real; v_ref_h real;
  v_neg real; v_perf real; v_wave_perf real; v_new_viewers integer; v_new_units real;
  v_vel real; v_prev real; v_rising integer; v_below integer; v_peak real;
  v_div real; v_completion real;
  v_m jsonb;
  v_recovered integer := 0; v_seen integer := 0; v_moved integer := 0;
begin
  -- One tick at a time: a slow tick is skipped over, never run twice at once.
  if not pg_try_advisory_xact_lock(hashtext('post_intelligence_tick')) then
    return jsonb_build_object('skipped', true);
  end if;

  -- Processing that never reported back (after() failed, or the post predates
  -- intake): the SQL half of processing, with no language or simhash.
  for r in
    select s.post_id from public.post_state s
    where s.stage = 'uploaded'
      and s.stage_since < now() - make_interval(mins => (cfg->>'recover_minutes')::integer)
  loop
    perform public.post_record_processing(r.post_id, null, null, null, null, null, null, null, null, 0::smallint, null);
    v_recovered := v_recovered + 1;
  end loop;

  select array_agg(x.post_id) into v_ids from (
    select s.post_id from public.post_state s join public.posts p on p.id = s.post_id
    where p.deleted_at is null and p.status = 'visible' and s.stage <> 'uploaded'
      and (p.created_at > now() - make_interval(days => (cfg->>'active_days')::integer)
           or s.stage in ('accelerating', 'trending', 'viral', 'peak', 'cooling')
           or s.computed_at < now() - interval '6 hours')
    order by p.created_at desc
    limit 500
  ) x;

  if v_ids is null then
    return jsonb_build_object('recovered', v_recovered, 'posts', 0);
  end if;

  create temp table _t on commit drop as select * from public.post_signal_totals(v_ids);

  create temp table _e on commit drop as
  select x.post_id, count(distinct x.uid)::integer engagers,
    count(distinct x.uid) filter (where not exists (
      select 1 from public.follows fo where fo.follower_id = x.uid and fo.following_id = x.author))::integer outside
  from (
    select l.entity_id post_id, l.user_id uid, p.author_id author from public.likes l
      join public.posts p on p.id = l.entity_id where l.entity_type = 'post' and l.entity_id = any (v_ids)
    union all
    select c.post_id, c.author_id, p.author_id from public.comments c
      join public.posts p on p.id = c.post_id where c.post_id = any (v_ids) and c.deleted_at is null
    union all
    select rp.post_id, rp.user_id, p.author_id from public.reposts rp
      join public.posts p on p.id = rp.post_id where rp.post_id = any (v_ids)
    union all
    select sv.entity_id, sv.user_id, p.author_id from public.saves sv
      join public.posts p on p.id = sv.entity_id where sv.entity_type = 'post' and sv.entity_id = any (v_ids)
  ) x where x.uid <> x.author
  group by x.post_id;

  select percentile_cont(0.5) within group (order by b.engagement_rate),
         percentile_cont(0.5) within group (order by b.units_per_hour)
    into v_platform_rate, v_platform_hourly
  from public.creator_baselines b where b.engagement_rate is not null;
  v_platform_rate := coalesce(v_platform_rate, (cfg->>'default_platform_rate')::real);
  v_platform_hourly := coalesce(v_platform_hourly, (cfg->>'default_platform_hourly')::real);

  -- The player reports each video's real length; the median wins over the
  -- browser's upload time reading.
  update public.post_features f set video_duration_ms = d.ms
  from (select v.post_id, percentile_cont(0.5) within group (order by v.duration_ms)::integer ms
        from public.post_video_events v
        where v.post_id = any (v_ids) and v.duration_ms > 0
        group by v.post_id) d
  where f.post_id = d.post_id and f.video_duration_ms is distinct from d.ms;

  for r in
    select t.*, s.stage, s.wave, s.stage_since, s.perf_at_wave, s.wave_units_start,
      s.wave_viewers_start, s.rising_ticks, s.below_peak_ticks, s.peak_velocity, s.velocity st_velocity,
      s.metrics st_metrics, p.created_at, p.kind, p.topic_id,
      greatest(p.report_count - p.qualified_report_count, 0) pending_reports, p.qualified_report_count,
      f.spam_risk, f.duplicate_of,
      coalesce(e.engagers, 0) engagers, coalesce(e.outside, 0) outside_engagers,
      cb.engagement_rate c_rate, cb.units_per_hour c_hourly, tv.engagement_rate t_rate,
      (select sn.units from public.post_metrics_snapshots sn where sn.post_id = t.post_id
        and sn.at <= now() - interval '55 minutes' order by sn.at desc limit 1) u_60,
      (select sn.units from public.post_metrics_snapshots sn where sn.post_id = t.post_id
        and sn.at <= now() - interval '115 minutes' order by sn.at desc limit 1) u_120
    from _t t
    join public.post_state s on s.post_id = t.post_id
    join public.posts p on p.id = t.post_id
    left join public.post_features f on f.post_id = t.post_id
    left join _e e on e.post_id = t.post_id
    left join public.creator_baselines cb on cb.author_id = p.author_id and cb.posts_used >= 3
    left join public.topic_velocity tv on tv.topic_id = p.topic_id and tv."window" = '7d' and tv.viewers >= 20
  loop
    v_seen := v_seen + 1;

    -- Reference: this creator (or half the platform for a new one), blended
    -- with the topic when the topic has enough viewers to say anything.
    v_c := coalesce(r.c_rate, v_platform_rate * (cfg->>'new_creator_factor')::real);
    v_t := r.t_rate;
    v_ref := greatest(case when v_t is not null and v_t > 0 then sqrt(greatest(v_c, 0) * v_t) else v_c end,
                      (cfg->>'min_ref_rate')::real);
    v_ref_h := greatest(coalesce(r.c_hourly, v_platform_hourly * (cfg->>'new_creator_factor')::real),
                        (cfg->>'min_ref_hourly')::real);

    v_neg := (r.not_interested + r.hides + 3 * r.reports)::real / greatest(r.viewers, 1);
    v_perf := ((r.units + k * v_ref) / (r.viewers + k)) / v_ref * (1 - least(0.9, 5 * v_neg));
    if r.kind = 'video' and r.video_starts >= 5 then
      v_completion := r.completions::real / greatest(r.video_starts, 1);
      v_perf := v_perf * (0.6 + 0.8 * least(1, v_completion));
    end if;

    v_new_viewers := r.viewers - r.wave_viewers_start;
    v_new_units := r.units - r.wave_units_start;
    v_wave_perf := case when v_new_viewers >= (cfg->>'wave_min_new_viewers')::integer
      then ((v_new_units + k * v_ref) / (v_new_viewers + k)) / v_ref * (1 - least(0.9, 5 * v_neg)) end;

    v_vel := r.units_1h;
    v_prev := case when r.u_60 is not null and r.u_120 is not null then greatest(r.u_60 - r.u_120, 0)
                   else r.units_1_6h / 5 end;
    v_rising := case when v_vel > v_prev and v_vel > 0 then r.rising_ticks + 1 else 0 end;
    v_peak := greatest(r.peak_velocity, v_vel);
    v_below := case when v_peak > 0 and v_vel < (cfg->>'peak_fraction')::real * v_peak then r.below_peak_ticks + 1 else 0 end;
    v_div := case when r.engagers > 0 then r.outside_engagers::real / r.engagers else 0 end;

    v_m := jsonb_build_object(
      'viewers', r.viewers, 'perf', round(v_perf::numeric, 4), 'wave_perf', round(v_wave_perf::numeric, 4),
      'perf_at_wave', r.perf_at_wave, 'vel', v_vel, 'vel_prev', v_prev, 'ref_hourly', v_ref_h,
      'ref_rate', v_ref, 'rising_ticks', v_rising, 'below_peak_ticks', v_below,
      'participants_24h', r.participants_24h, 'engagers_6h', r.engagers_6h,
      'engagers', r.engagers, 'diversity', round(v_div::numeric, 4), 'neg', round(v_neg::numeric, 4),
      'spam', r.spam_risk, 'duplicate', r.duplicate_of is not null,
      'pending_reports', r.pending_reports, 'qualified_reports', r.qualified_report_count,
      'cool_from_wave', coalesce((r.st_metrics->>'cool_from_wave')::integer, r.wave),
      'completion', v_completion, 'units', r.units);

    insert into public.post_metrics_snapshots (post_id, viewers, impressions, qualified, dwell_avg,
      video_starts, watch_avg, completions, rewatches, skips, likes, comments, reposts, shares, saves,
      follows, profile_visits, link_clicks, media_opens, not_interested, hides, reports, units,
      engagers, outside_engagers)
    values (r.post_id, r.viewers, r.impressions, r.qualified, r.dwell_avg, r.video_starts, r.watch_avg,
      r.completions, r.rewatches, r.skips, r.likes, r.comments, r.reposts, r.shares, r.saves, r.follows,
      r.profile_visits, r.link_clicks, r.media_opens, r.not_interested, r.hides, r.reports, r.units,
      r.engagers, r.outside_engagers)
    on conflict do nothing;

    select * into n from public.post_next_stage(r.stage, r.wave,
      extract(epoch from now() - r.stage_since)::real / 3600,
      extract(epoch from now() - r.created_at)::real / 3600, v_m, cfg);

    if n.stage <> r.stage or n.wave <> r.wave then
      v_moved := v_moved + 1;
      update public.post_state set
        stage = n.stage, wave = n.wave,
        stage_since = case when n.stage <> r.stage then now() else stage_since end,
        wave_started_at = now(), wave_units_start = r.units, wave_viewers_start = r.viewers,
        perf_at_wave = case when n.wave > r.wave then v_perf else perf_at_wave end,
        below_peak_ticks = case when n.stage <> r.stage then 0 else v_below end,
        rising_ticks = v_rising, velocity = v_vel, velocity_prev = v_prev,
        peak_velocity = v_peak, peak_at = case when v_vel >= v_peak and v_vel > 0 then now() else peak_at end,
        perf_score = v_perf, reference_rate = v_ref, reference_hourly = v_ref_h,
        metrics = case when n.stage = 'cooling' and r.stage <> 'cooling'
                       then v_m || jsonb_build_object('cool_from_wave', r.wave) else v_m end,
        computed_at = now()
      where post_id = r.post_id;
      if n.stage <> r.stage then
        insert into public.post_lifecycle_events (post_id, from_stage, to_stage, wave, reason)
        values (r.post_id, r.stage, n.stage, n.wave, v_m || jsonb_build_object('rule', n.rule));
      end if;
    else
      update public.post_state set
        rising_ticks = v_rising, below_peak_ticks = v_below, velocity = v_vel, velocity_prev = v_prev,
        peak_velocity = v_peak, peak_at = case when v_vel >= v_peak and v_vel > 0 then now() else peak_at end,
        perf_score = v_perf, reference_rate = v_ref, reference_hourly = v_ref_h,
        metrics = v_m, computed_at = now()
      where post_id = r.post_id;
    end if;
  end loop;

  return jsonb_build_object('recovered', v_recovered, 'posts', v_seen, 'moved', v_moved);
end $$;

-- Hourly: each creator's usual, from their last 20 settled posts.
create or replace function public.refresh_creator_baselines()
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare v_ids uuid[]; v_n integer;
begin
  select array_agg(id) into v_ids from (
    select p.id, row_number() over (partition by p.author_id order by p.created_at desc) rn
    from public.posts p
    where p.deleted_at is null and p.status = 'visible'
      and p.created_at < now() - interval '24 hours' and p.created_at > now() - interval '90 days'
  ) x where rn <= 20 limit 500;
  if v_ids is null then return 0; end if;

  insert into public.creator_baselines as b (author_id, posts_used, engagement_rate, comment_rate,
    share_rate, save_rate, follow_rate, completion_rate, units_per_hour, updated_at)
  select p.author_id, count(*),
    percentile_cont(0.5) within group (order by t.units / t.viewers),
    percentile_cont(0.5) within group (order by t.comments::real / t.viewers),
    percentile_cont(0.5) within group (order by t.shares::real / t.viewers),
    percentile_cont(0.5) within group (order by t.saves::real / t.viewers),
    percentile_cont(0.5) within group (order by t.follows::real / t.viewers),
    percentile_cont(0.5) within group (order by case when t.video_starts > 0 then t.completions::real / t.video_starts end),
    percentile_cont(0.5) within group (order by t.units / least(72, greatest(1, extract(epoch from now() - p.created_at) / 3600))),
    now()
  from public.post_signal_totals(v_ids) t join public.posts p on p.id = t.post_id
  where t.viewers >= 3
  group by p.author_id
  on conflict (author_id) do update set posts_used = excluded.posts_used,
    engagement_rate = excluded.engagement_rate, comment_rate = excluded.comment_rate,
    share_rate = excluded.share_rate, save_rate = excluded.save_rate, follow_rate = excluded.follow_rate,
    completion_rate = excluded.completion_rate, units_per_hour = excluded.units_per_hour,
    updated_at = now();
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Hourly: how fast each topic is moving, over an hour, a day and a week.
create or replace function public.refresh_topic_velocity()
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare v_ids uuid[]; v_n integer;
begin
  select array_agg(p.id) into v_ids from (
    select p.id from public.posts p
    where p.deleted_at is null and p.status = 'visible' and p.topic_id is not null
      and p.created_at > now() - interval '7 days'
    order by p.created_at desc limit 500) p;

  delete from public.topic_velocity;
  if v_ids is null then return 0; end if;

  insert into public.topic_velocity (topic_id, "window", units, posts, participants, viewers, velocity, engagement_rate)
  select p.topic_id, w.name,
    sum(case w.name when '1h' then t.units_1h when '24h' then t.units_1h + t.units_1_6h + t.units_6_24h else t.units end),
    count(*), sum(t.participants_24h), sum(t.viewers),
    sum(case w.name when '1h' then t.units_1h when '24h' then t.units_1h + t.units_1_6h + t.units_6_24h else t.units end)
      / w.hours,
    case when sum(t.viewers) > 0 then sum(t.units) / sum(t.viewers) end
  from public.post_signal_totals(v_ids) t
  join public.posts p on p.id = t.post_id
  cross join (values ('1h', 1.0), ('24h', 24.0), ('7d', 168.0)) w(name, hours)
  group by p.topic_id, w.name, w.hours;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

create or replace function public.post_intelligence_housekeeping()
returns void language sql security definer set search_path = public, pg_temp as $$
  delete from public.post_metrics_snapshots
  where at < now() - make_interval(days => (select (config->>'snapshot_retention_days')::integer from public.post_intelligence_config));
$$;

-- The ranker's read: stage, wave and scores, never who.
create or replace function public.post_states(p_ids uuid[])
returns table(post_id uuid, stage text, wave smallint, new_author boolean, perf_score real,
  velocity real, reference_hourly real, stage_since timestamptz, computed_at timestamptz, stale boolean)
language sql stable security definer set search_path = public, pg_temp as $$
  select s.post_id, s.stage, s.wave, s.new_author, s.perf_score, s.velocity, s.reference_hourly,
    s.stage_since, s.computed_at,
    s.computed_at < now() - make_interval(mins => (select (config->>'stale_minutes')::integer from public.post_intelligence_config))
  from public.post_state s where s.post_id = any (p_ids[1:500]);
$$;

-- The author's insights (D148). Null for anybody else, and the page 404s.
create or replace function public.my_post_insights(p_post_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_post record;
  v_out jsonb;
begin
  select p.id, p.author_id, p.created_at, p.kind into v_post
  from public.posts p where p.id = p_post_id and p.deleted_at is null;
  if v_uid is null or v_post.id is null or v_post.author_id <> v_uid then return null; end if;

  select jsonb_build_object(
    'post_id', v_post.id,
    'created_at', v_post.created_at,
    'kind', v_post.kind,
    'state', (select jsonb_build_object('stage', s.stage, 'wave', s.wave, 'stage_since', s.stage_since,
                'perf_score', s.perf_score, 'computed_at', s.computed_at, 'new_author', s.new_author)
              from public.post_state s where s.post_id = v_post.id),
    'totals', (select to_jsonb(t) - 'post_id' from public.post_signal_totals(array[v_post.id]) t),
    'baseline', (select to_jsonb(b) - 'author_id' from public.creator_baselines b where b.author_id = v_uid),
    'history', coalesce((select jsonb_agg(jsonb_build_object('at', h.at, 'viewers', h.viewers,
                  'likes', h.likes, 'comments', h.comments, 'reposts', h.reposts, 'saves', h.saves,
                  'shares', h.shares, 'completions', h.completions) order by h.at)
                from (select distinct on (date_trunc('hour', sn.at)) sn.*
                      from public.post_metrics_snapshots sn where sn.post_id = v_post.id
                      order by date_trunc('hour', sn.at), sn.at desc) h), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object('from', e.from_stage, 'to', e.to_stage,
                  'wave', e.wave, 'at', e.at, 'rule', e.reason->>'rule', 'viewers', e.reason->'viewers') order by e.at)
                from public.post_lifecycle_events e where e.post_id = v_post.id), '[]'::jsonb),
    'sources', (select jsonb_build_object(
        'for_you', count(*) filter (where x.src = 'for_you'),
        'following', count(*) filter (where x.src in ('following', 'video:following')),
        'video', count(*) filter (where x.src in ('video', 'video:video', 'video:feed')),
        'profile', count(*) filter (where x.src in ('profile', 'video:profile')),
        'explore', count(*) filter (where x.src in ('explore', 'video:explore')),
        'search', count(*) filter (where x.src = 'search'),
        'other', count(*) filter (where x.src in ('topic', 'trending', 'post')))
      from (select f.surface src from public.feed_events f where f.post_id = v_post.id and f.event = 'impression'
            union all
            select 'video:' || v.source from public.post_video_events v where v.post_id = v_post.id and v.event = 'impression') x)
  ) into v_out;
  return v_out;
end $$;

-- Admins: every post's state, for /admin/post-intelligence.
create or replace function public.admin_post_intelligence(p_limit integer default 100)
returns table(post_id uuid, author_username text, body text, created_at timestamptz, stage text,
  wave smallint, perf_score real, velocity real, reference_hourly real, viewers integer,
  stage_since timestamptz, computed_at timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.admin_require('analytics.read');
  return query
  select s.post_id, pr.username::text, left(p.body, 140), p.created_at, s.stage, s.wave, s.perf_score,
    s.velocity, s.reference_hourly, coalesce((s.metrics->>'viewers')::integer, 0), s.stage_since, s.computed_at
  from public.post_state s join public.posts p on p.id = s.post_id
  join public.profiles pr on pr.id = p.author_id
  where p.deleted_at is null
  order by s.computed_at desc, p.created_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
end $$;

create or replace function public.admin_post_intelligence_status()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.admin_require('analytics.read');
  return jsonb_build_object(
    'config', (select config from public.post_intelligence_config),
    'last_tick', (select max(computed_at) from public.post_state),
    'stages', (select jsonb_object_agg(stage, n) from (select stage, count(*) n from public.post_state group by stage) x),
    'jobs', (select jsonb_agg(jsonb_build_object('name', j.jobname, 'schedule', j.schedule, 'active', j.active))
             from cron.job j where j.jobname like 'post-intelligence%'));
end $$;

revoke all on function public.post_next_stage(text, integer, real, real, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.post_intelligence_tick() from public, anon, authenticated;
revoke all on function public.refresh_creator_baselines() from public, anon, authenticated;
revoke all on function public.refresh_topic_velocity() from public, anon, authenticated;
revoke all on function public.post_intelligence_housekeeping() from public, anon, authenticated;
revoke all on function public.post_states(uuid[]) from public, anon, authenticated;
revoke all on function public.my_post_insights(uuid) from public, anon, authenticated;
revoke all on function public.admin_post_intelligence(integer) from public, anon, authenticated;
revoke all on function public.admin_post_intelligence_status() from public, anon, authenticated;
grant execute on function public.post_states(uuid[]) to service_role;
grant execute on function public.post_next_stage(text, integer, real, real, jsonb, jsonb) to service_role;
grant execute on function public.my_post_insights(uuid) to authenticated;
grant execute on function public.admin_post_intelligence(integer) to authenticated;
grant execute on function public.admin_post_intelligence_status() to authenticated;

select cron.schedule('post-intelligence-tick', '*/5 * * * *', 'select public.post_intelligence_tick()');
select cron.schedule('post-intelligence-baselines', '7 * * * *',
  'select public.refresh_creator_baselines(); select public.refresh_topic_velocity(); select public.post_intelligence_housekeeping();');
