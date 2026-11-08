-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260925130413. History: never edit.

-- A post's own author is not its audience: their impressions, likes, saves
-- and watching are left out of every signal (found by the 4BG signed in pass,
-- where the author's own view counted as the video's one viewer).
do $$
declare d text; before text; after text;
begin
  d := pg_get_functiondef('public.feed_post_signals(uuid[])'::regprocedure);
  before := E'  ev as (\n    select * from raw where signal is not null\n    union all select * from watch\n    union all select * from rewatch\n  )';
  after := E'  ev as (\n    select x.* from (\n      select * from raw where signal is not null\n      union all select * from watch\n      union all select * from rewatch\n    ) x\n    join ids on ids.id = x.post_id\n    where x.actor is distinct from ids.author_id::text\n  )';
  if position(before in d) = 0 then raise exception 'feed_post_signals patch anchor not found'; end if;
  d := replace(d, before, after);
  execute d;
end $$;
revoke all on function public.feed_post_signals(uuid[]) from public, anon, authenticated;
grant execute on function public.feed_post_signals(uuid[]) to service_role;
