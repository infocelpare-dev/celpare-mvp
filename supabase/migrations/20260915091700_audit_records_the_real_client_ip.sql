-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260915091700. History: never edit.

-- The audit log was recording the wrong IP address.
--
-- admin_audit read x-forwarded-for out of PostgREST's request headers. Supabase's
-- edge sets that to the address of whoever called it, and for a server rendered
-- app the caller is the Next.js server rather than the administrator's browser.
-- In development the two are the same machine, so the value looked right while
-- meaning nothing. Deployed, every entry would have carried the serverless
-- egress address, and somebody investigating an incident would have chased it.
--
-- The admin session client now forwards the real client address under
-- x-celpare-client-ip, a header only our own server sets. It is preferred here,
-- and x-forwarded-for stays as a fallback so an entry written by anything else
-- still records something rather than nothing.
--
-- The header carries no authority. Nothing reads it to decide anything: it is
-- written down and nothing more, which is why a forged value would be a false
-- line in a log rather than an escalation.
create or replace function public.admin_audit(
  p_action       text,
  p_entity_type  text,
  p_entity_id    text,
  p_entity_label text default null,
  p_reason       text default null,
  p_before       jsonb default '{}'::jsonb,
  p_after        jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_headers json;
  v_raw text;
  v_ip inet;
begin
  begin
    v_headers := current_setting('request.headers', true)::json;
    v_raw := nullif(btrim(coalesce(
      v_headers ->> 'x-celpare-client-ip',
      split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1))), '');
    v_ip := v_raw::inet;
  exception when others then
    -- Absent outside PostgREST, and unparseable if anything sends nonsense.
    -- An entry with no address is still a complete record of who did what to
    -- whom, which is the part that matters.
    v_ip := null;
  end;

  insert into public.admin_audit_log
    (actor_id, actor_role, action, entity_type, entity_id, entity_label,
     reason, before_state, after_state, ip)
  values
    ((select auth.uid()), public.my_admin_role(), p_action, p_entity_type,
     p_entity_id, p_entity_label, nullif(btrim(coalesce(p_reason, '')), ''),
     coalesce(p_before, '{}'::jsonb), coalesce(p_after, '{}'::jsonb), v_ip);
end;
$$;

revoke execute on function public.admin_audit(text, text, text, text, text, jsonb, jsonb)
  from public, anon, authenticated;

comment on column public.admin_audit_log.ip is
  'The administrator''s own address, forwarded by the app under x-celpare-client-ip.
   Recorded only for actions, never for reads. Never used to authorise anything.';
