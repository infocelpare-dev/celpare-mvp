-- refresh_tool_terms emptied tool_terms with a bare DELETE. Requests from the
-- app go through PostgREST, where Supabase loads pg-safeupdate, and that
-- refuses any DELETE without a WHERE clause ("DELETE requires a WHERE
-- clause"). It only ever ran from migrations before, as the owner, where the
-- guard is off. D274 and D275 call it from update_tool and
-- admin_decide_tool_rename, so a developer's live edit and an admin's rename
-- both failed (founder, 2026-11-25). `where true` states the intent and
-- satisfies the guard.

create or replace function public.refresh_tool_terms()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  delete from public.tool_terms where true;
  insert into public.tool_terms (word, ndoc)
  select word, ndoc
  from ts_stat('select search_vector from public.tools where status = ''approved''');
end;
$function$;

-- Only ever called inside other definer functions (D250).
revoke all on function public.refresh_tool_terms() from public, anon, authenticated;
