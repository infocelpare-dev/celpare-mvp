-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260928080256. History: never edit.

-- 4BK, D178: the caller's own tool and model activity, across surfaces, newest first.
-- Own rows only (auth.uid()); nothing about anybody else can come back.
create or replace function public.my_tool_model_activity(p_days integer default 30)
 returns table(surface text, event text, entity_type text, entity_id uuid, query text, at timestamptz)
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  with me as (select (select auth.uid()) as uid),
  since as (select now() - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 90)) as t)
  select * from (
    select 'tool_profile'::text, 'open'::text, 'tool'::text, v.tool_id, v.query, v.created_at
      from public.tool_view_events v, me, since
     where v.user_id = me.uid and v.created_at > since.t
    union all
    select 'model_profile', 'open', 'model', v.model_id, v.query, v.created_at
      from public.model_view_events v, me, since
     where v.user_id = me.uid and v.created_at > since.t
    union all
    select r.surface, r.event, r.entity_type, r.entity_id, null, r.created_at
      from public.recommendation_events r, me, since
     where r.user_id = me.uid and r.entity_type in ('tool','model') and r.entity_id is not null
       and r.created_at > since.t
    union all
    select 'search', 'query', null, null, s.query, s.created_at
      from public.search_events s, me, since
     where s.user_id = me.uid and s.created_at > since.t
    union all
    select 'search', 'click', s.result_type, s.result_id, s.normalized, s.created_at
      from public.search_result_events s, me, since
     where s.user_id = me.uid and s.event = 'click' and s.result_type in ('tool','model')
       and s.created_at > since.t
    union all
    select 'compare', 'compare_add', c.item_type, c.item_id, null, c.created_at
      from public.compare_events c, me, since
     where c.user_id = me.uid and c.event = 'item_added' and c.item_id is not null
       and c.created_at > since.t
    union all
    select 'saved', 'save', 'tool', st.tool_id, null, st.created_at
      from public.user_saved_tools st, me where st.user_id = me.uid
    union all
    select 'saved', 'save', 'model', sm.model_id, null, sm.created_at
      from public.user_saved_models sm, me where sm.user_id = me.uid
    union all
    select 'collection', 'save', case when ci.tool_id is not null then 'tool' else 'model' end,
           coalesce(ci.tool_id, ci.model_id), null, ci.created_at
      from public.user_collection_items ci
      join public.user_collections uc on uc.id = ci.collection_id and uc.deleted_at is null, me
     where uc.user_id = me.uid and (ci.tool_id is not null or ci.model_id is not null)
    union all
    select 'tool_profile', case when tr.value > 0 then 'like' else 'dislike' end, 'tool', tr.tool_id, null, tr.created_at
      from public.tool_reactions tr, me where tr.user_id = me.uid and tr.value <> 0
  ) a(surface, event, entity_type, entity_id, query, at)
  where (select uid from me) is not null
  order by at desc
  limit 2000;
$function$;
revoke all on function public.my_tool_model_activity(integer) from public, anon;
grant execute on function public.my_tool_model_activity(integer) to authenticated, service_role;

-- 4BK, D176 and D177: pairs of catalogue entries that people looked at together.
-- Counts only, and only pairs at least two distinct people produced. Service role only.
create or replace function public.rec_item_cooccurrence(p_ids uuid[])
 returns table(a_type text, a_id uuid, b_type text, b_id uuid, people integer, source text)
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  with wanted as (
    select distinct u as id from unnest(coalesce(p_ids, '{}'::uuid[])) u limit 500
  ),
  sets as (
    select distinct c.user_id, c.signature
      from public.compare_events c
     where c.user_id is not null and c.signature is not null
       and c.event in ('comparison_viewed','comparison_completed')
       and c.created_at > now() - interval '180 days'
  ),
  members as (
    select s.user_id, s.signature, split_part(ref, ':', 1) as t, split_part(ref, ':', 2) as slug
      from sets s, unnest(string_to_array(s.signature, ',')) ref
  ),
  resolved as (
    select m.user_id, m.signature, m.t, coalesce(tl.id, md.id) as id
      from members m
      left join public.tools tl on m.t = 'tool' and tl.slug = m.slug and tl.status = 'approved'
      left join public.models md on m.t = 'model' and md.slug = m.slug and md.status = 'approved'
  ),
  compared as (
    select x.t as a_type, x.id as a_id, y.t as b_type, y.id as b_id,
           count(distinct x.user_id)::int as people, 'co_compared'::text as source
      from resolved x join resolved y
        on x.user_id = y.user_id and x.signature = y.signature and x.id <> y.id
     where x.id in (select id from wanted) and y.id is not null
     group by 1, 2, 3, 4
  ),
  views as (
    select v.user_id, 'tool'::text as t, v.tool_id as id, v.created_at as at
      from public.tool_view_events v
     where v.user_id is not null and v.created_at > now() - interval '180 days'
    union all
    select v.user_id, 'model', v.model_id, v.created_at
      from public.model_view_events v
     where v.user_id is not null and v.created_at > now() - interval '180 days'
  ),
  viewed as (
    select x.t as a_type, x.id as a_id, y.t as b_type, y.id as b_id,
           count(distinct x.user_id)::int as people, 'co_viewed'::text as source
      from views x join views y
        on x.user_id = y.user_id and x.id <> y.id
       and y.at between x.at - interval '30 minutes' and x.at + interval '30 minutes'
     where x.id in (select id from wanted)
     group by 1, 2, 3, 4
  )
  select * from compared where people >= 2
  union all
  select * from viewed where people >= 2;
$function$;
revoke all on function public.rec_item_cooccurrence(uuid[]) from public, anon, authenticated;
grant execute on function public.rec_item_cooccurrence(uuid[]) to service_role;

-- 4BK, D12 and D39: the Ask projection for a chosen set of tools. The same seven
-- columns as search_tools, SECURITY INVOKER, so RLS limits rows to approved tools.
create or replace function public.search_tools_by_slugs(slugs text[])
 returns table(slug text, name text, description text, pricing text, tags text[], rating numeric, features text[])
 language sql
 stable security invoker
 set search_path to 'public', 'pg_temp'
as $function$
  select t.slug::text, t.name, left(coalesce(t.description, ''), 600), t.pricing, t.tags, t.rating, t.features
    from public.tools t
   where t.status = 'approved'
     and t.slug = any ((coalesce(slugs, '{}'::text[]))[1:12]);
$function$;
revoke all on function public.search_tools_by_slugs(text[]) from public;
grant execute on function public.search_tools_by_slugs(text[]) to anon, authenticated, service_role;
