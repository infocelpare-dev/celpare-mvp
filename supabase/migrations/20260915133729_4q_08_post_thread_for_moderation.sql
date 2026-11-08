-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260915133729. History: never edit.

-- Phase 4Q.6. The post detail page global search has been linking to all along.
--
-- admin_global_search returns '/admin/community/post/<id>' for every post and
-- comment hit, and no such route existed: searching for a post in the dashboard
-- led to a 404. The route is the fix rather than a changed href, because
-- moderating a comment without seeing the post it answers is guesswork, and the
-- reports queue has the same problem from the other direction.
--
-- One document rather than two calls. report_count and qualified_report_count
-- are deliberately absent from the client grant, which is why this cannot be a
-- pair of ordinary selects (defect P4 in Phase 4P).

create or replace function public.admin_post_thread(p_post_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_post     jsonb;
  v_comments jsonb;
  v_reports  jsonb;
begin
  perform public.admin_require('content.moderate');

  select to_jsonb(p) || jsonb_build_object(
           'author', jsonb_build_object(
             'id', pr.id,
             'username', pr.username,
             'full_name', pr.full_name,
             'avatar_url', pr.avatar_url,
             'account_status', pr.account_status),
           'topic', t.name)
    into v_post
    from public.posts p
    join public.profiles pr on pr.id = p.author_id
    left join public.topics t on t.id = p.topic_id
   where p.id = p_post_id;

  if v_post is null then
    return null;
  end if;

  select coalesce(jsonb_agg(c order by c.created_at), '[]'::jsonb)
    into v_comments
    from (
      select to_jsonb(cm) || jsonb_build_object(
               'author', jsonb_build_object(
                 'id', pr.id,
                 'username', pr.username,
                 'full_name', pr.full_name,
                 'avatar_url', pr.avatar_url,
                 'account_status', pr.account_status)) as c,
             cm.created_at
        from public.comments cm
        join public.profiles pr on pr.id = cm.author_id
       where cm.post_id = p_post_id
    ) c;

  -- Every report filed against the post or any of its comments, so the case is
  -- in one place. Reporter identities are not included: who reported something
  -- is not needed to decide whether it breaks a rule, and the reports centre is
  -- where that belongs.
  if public.has_admin_capability('reports.read') then
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', r.id,
             'entity_type', r.entity_type,
             'entity_id', r.entity_id,
             'reason', r.reason,
             'note', r.note,
             'status', r.status,
             'priority', r.priority,
             'qualified', r.qualified,
             'created_at', r.created_at) order by r.created_at desc), '[]'::jsonb)
      into v_reports
      from public.reports r
     where (r.entity_type = 'post' and r.entity_id = p_post_id)
        or (r.entity_type = 'comment'
            and r.entity_id in (select id from public.comments where post_id = p_post_id));
  end if;

  return jsonb_build_object(
    'post', v_post,
    'comments', v_comments,
    'reports', coalesce(v_reports, '[]'::jsonb));
end;
$$;

revoke all on function public.admin_post_thread(uuid) from public, anon, authenticated;
grant execute on function public.admin_post_thread(uuid) to authenticated;
