-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260925120445. History: never edit.

do $$
declare d text;
begin
  d := pg_get_functiondef('public.post_intelligence_tick()'::regprocedure);
  d := replace(d, 'public.post_next_stage(r.stage, r.wave,', 'public.post_next_stage(r.stage, r.wave::integer,');
  d := replace(d, 'extract(epoch from now() - r.stage_since)::real / 3600,', '(extract(epoch from now() - r.stage_since) / 3600)::real,');
  d := replace(d, 'extract(epoch from now() - r.created_at)::real / 3600, v_m, cfg)', '(extract(epoch from now() - r.created_at) / 3600)::real, v_m, cfg)');
  if position('r.wave::integer' in d) = 0 or position('r.created_at) / 3600)::real' in d) = 0 then
    raise exception 'patch did not apply';
  end if;
  execute d;
end $$;
revoke all on function public.post_intelligence_tick() from public, anon, authenticated;
