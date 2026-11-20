-- Plans removed (D271, 2026-11-20). Nobody sets a plan by hand any more:
-- profiles.plan stays free, and developer_profiles.plan is written only by
-- developer_sponsor_sync from active sponsorships. The admin UI for both was
-- removed; this closes the RPCs behind it. The functions stay for history.
revoke execute on function public.admin_set_user_plan(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.admin_set_developer_plan(uuid, text, text) from public, anon, authenticated;
