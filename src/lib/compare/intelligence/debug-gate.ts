/*
  Who may see /compare?debug=1 (guide 16 section 22). Pure so it can be tested;
  the page resolves isAdmin with getAdminSession(), the same gate Explore uses.
  A non admin asking for debug gets the ordinary page, never an error that says
  a debug view exists.
*/
export function debugAllowed(input: { requested: boolean; signedIn: boolean; isAdmin: boolean }): boolean {
  return input.requested && input.signedIn && input.isAdmin;
}
