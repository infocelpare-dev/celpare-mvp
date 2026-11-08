-- OPS step 7, 2026-11-08. The security advisor lists 14 SECURITY DEFINER
-- functions anon can execute and 106 authenticated can. Checked one by one:
-- policy helpers need EXECUTE for the querying role, and app RPCs check the
-- caller in their body, so those stay. These ten need no client EXECUTE:
--
-- Called only from inside other SECURITY DEFINER functions, which run as the
-- owner, so the outer caller never needs EXECUTE on them:
--   admin_assert_outranks, admin_require, moderate_set_status, my_admin_role
--
-- Called by nothing: not the app, a policy, a function, a view or cron:
--   is_admin, moderate_resolve_report, my_post_distribution,
--   sponsored_tool_ids, tool_owner_stats, withdraw_developer_terms
--
-- Proven before applying, in a rolled back transaction as authenticated with
-- real claims: the founder's admin_overview (admin_require inside) still
-- works; admin_require called directly and sponsored_tool_ids as an ordinary
-- user are refused with 42501. service_role keeps EXECUTE.

revoke execute on function public.admin_assert_outranks(p_target uuid) from public, anon, authenticated;
revoke execute on function public.admin_require(p_capability text) from public, anon, authenticated;
revoke execute on function public.is_admin() from public, anon, authenticated;
revoke execute on function public.moderate_resolve_report(p_report_id uuid, p_resolution text) from public, anon, authenticated;
revoke execute on function public.moderate_set_status(p_entity_type text, p_entity_id uuid, p_status text) from public, anon, authenticated;
revoke execute on function public.my_admin_role() from public, anon, authenticated;
revoke execute on function public.my_post_distribution(p_limit integer) from public, anon, authenticated;
revoke execute on function public.sponsored_tool_ids() from public, anon, authenticated;
revoke execute on function public.tool_owner_stats(p_tool_id uuid) from public, anon, authenticated;
revoke execute on function public.withdraw_developer_terms() from public, anon, authenticated;
