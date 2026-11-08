-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260918104443. History: never edit.

-- Recent activity: the searches you ran and the tools you opened.
--
-- search_events and tool_view_events have RLS on and no policies, and anon and
-- authenticated hold no grant on either. That is deliberate: they are the
-- analytics tables the spend and abuse dashboards read, and telemetry nobody
-- can forge is worth more than telemetry that needs no key (see lib/telemetry.ts).
--
-- So this does NOT open them up. It is SECURITY DEFINER for the same reason
-- post_tool_update is: the caller has no read path to these tables at all, and
-- granting one would mean handing every signed in account a filterable view of
-- a table that also holds everybody else's rows. This returns the caller's own
-- rows and nothing else, joins what it needs, and takes no parameter that can
-- widen it.
--
-- Recent is private, always. It is never rendered on /u/[username], there is no
-- setting that makes it public, and this function has no way to ask for
-- somebody else's. Founder decision 2026-09-18.

create or replace function public.my_recent_activity(p_limit int default 20)
returns table (
  kind        text,
  occurred_at timestamptz,
  label       text,
  href        text,
  detail      text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with me as (select auth.uid() as uid),
  -- One row per distinct search, the most recent time it was run. Somebody who
  -- retypes the same query four times has done one thing worth listing.
  searches as (
    select distinct on (s.normalized)
      'search'::text            as kind,
      s.created_at              as occurred_at,
      s.query                   as label,
      '/explore?q=' || replace(replace(replace(s.query, '%', '%25'), '&', '%26'), '#', '%23') as href,
      case
        when s.result_count = 1 then '1 result'
        else s.result_count::text || ' results'
      end                       as detail
    from public.search_events s, me
    where s.user_id = me.uid
    order by s.normalized, s.created_at desc
  ),
  -- Same rule for tools: the last time you opened it, not every time.
  -- Joined to tools rather than trusting the event row, so a tool that was
  -- removed or unpublished since simply drops out of the list.
  views as (
    select distinct on (v.tool_id)
      'tool'::text              as kind,
      v.created_at              as occurred_at,
      t.name                    as label,
      '/tools/' || t.slug       as href,
      t.tagline                 as detail
    from public.tool_view_events v
    join public.tools t on t.id = v.tool_id
    cross join me
    where v.user_id = me.uid
      and t.status = 'approved'
    order by v.tool_id, v.created_at desc
  )
  select kind, occurred_at, label, href, detail
  from (select * from searches union all select * from views) both_kinds
  where (select uid from me) is not null
  order by occurred_at desc
  limit greatest(1, least(coalesce(p_limit, 20), 50));
$$;

-- A new function is granted EXECUTE to anon and authenticated by pg_default_acl.
-- Revoke before granting, every time.
revoke all on function public.my_recent_activity(int) from public, anon, authenticated;
grant execute on function public.my_recent_activity(int) to authenticated;

-- Clearing it. Your own history is yours to delete, and a Recent list with no
-- way to empty it is a record somebody did not ask to keep.
--
-- It deletes rows rather than hiding them, so the platform's own aggregate
-- counts change too. That is the correct trade: these rows are personally
-- identifying by definition, and keeping a shadow copy after somebody pressed
-- Clear would make the button a lie.
create or replace function public.clear_my_recent_activity()
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authorised' using errcode = '42501';
  end if;

  delete from public.search_events     where user_id = v_uid;
  delete from public.tool_view_events  where user_id = v_uid;
end;
$$;

revoke all on function public.clear_my_recent_activity() from public, anon, authenticated;
grant execute on function public.clear_my_recent_activity() to authenticated;
