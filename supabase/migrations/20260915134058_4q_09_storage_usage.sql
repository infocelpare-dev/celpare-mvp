-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260915134058. History: never edit.

-- Phase 4Q.7. Storage usage, brief section 1 and 18.
--
-- The overview reported users, developers, tools, community, AI and platform
-- and said nothing about storage, because storage.objects is not in the public
-- schema and no client role can read it. One capability checked routine rather
-- than a grant on the storage schema, which would expose every object path and
-- owner to anything holding the role.
--
-- Counts and bytes only. No paths, no owners, no file names: a dashboard does
-- not need to enumerate people's avatars to report how much space they take.

create or replace function public.admin_storage_usage()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_buckets jsonb;
begin
  perform public.admin_require('admin.access');

  select coalesce(jsonb_agg(x.b order by x.name), '[]'::jsonb)
    into v_buckets
    from (
      select bu.name,
             jsonb_build_object(
               'name', bu.name,
               'public', bu.public,
               'size_limit', bu.file_size_limit,
               'objects', count(o.id),
               'bytes', coalesce(sum((o.metadata->>'size')::bigint), 0)) as b
        from storage.buckets bu
        left join storage.objects o on o.bucket_id = bu.id
       group by bu.id, bu.name, bu.public, bu.file_size_limit
    ) x;

  return jsonb_build_object(
    'buckets', v_buckets,
    'total_objects', (select coalesce(sum((b->>'objects')::bigint), 0)
                        from jsonb_array_elements(v_buckets) b),
    'total_bytes',   (select coalesce(sum((b->>'bytes')::bigint), 0)
                        from jsonb_array_elements(v_buckets) b));
end;
$$;

revoke all on function public.admin_storage_usage() from public, anon, authenticated;
grant execute on function public.admin_storage_usage() to authenticated;
