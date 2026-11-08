-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20261005171336. History: never edit.

-- A viewer who reported an ad stops seeing it, as one who hid it does.
create or replace function public.sponsored_viewer_state(p_viewer text, p_surface text)
returns table (tool_id uuid, served_24h integer, dismissed boolean, in_last_serve boolean, last_query_key text)
language sql stable security definer set search_path = public
as $$
  with last_serve as (
    select e.request_id, e.query_key
      from public.sponsored_events e
     where e.viewer_key = p_viewer and e.surface = p_surface and e.event = 'impression'
       and e.created_at > now() - interval '30 minutes'
     order by e.created_at desc limit 1
  ), mine as (
    select e.tool_id, e.event, e.request_id, e.created_at
      from public.sponsored_events e
     where e.viewer_key = p_viewer and e.created_at > now() - interval '30 days'
       and e.event in ('impression', 'dismiss', 'report')
  )
  select m.tool_id,
         count(*) filter (where m.event = 'impression' and m.created_at > now() - interval '24 hours')::int,
         bool_or(m.event in ('dismiss', 'report')),
         bool_or(m.event = 'impression' and m.request_id is not distinct from (select request_id from last_serve)
                 and (select request_id from last_serve) is not null),
         (select query_key from last_serve)
    from mine m
   group by m.tool_id;
$$;
revoke all on function public.sponsored_viewer_state(text, text) from public, anon, authenticated;
grant execute on function public.sponsored_viewer_state(text, text) to service_role;
