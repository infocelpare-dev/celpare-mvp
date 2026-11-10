-- SEC.7 finding 1, contract step. profiles.role was readable by anon, so
-- profiles?role=neq.user named the super_admin account. The app reads roles
-- through profile_roles() (20261110061218) since bacc26e, live as d3cf101.
revoke select (role) on public.profiles from anon, authenticated;
