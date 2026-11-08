-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260925120605. History: never edit.

do $$
declare d text;
begin
  d := pg_get_functiondef('public.tg_post_intake()'::regprocedure);
  d := replace(d, 'pr.username = x.u::citext', 'pr.username = x.u::extensions.citext');
  if position('extensions.citext' in d) = 0 then raise exception 'patch did not apply'; end if;
  execute d;
end $$;
revoke all on function public.tg_post_intake() from public, anon, authenticated;
