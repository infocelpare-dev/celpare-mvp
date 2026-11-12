/*
  Where Log out leaves you (founder, 2026-11-09): inside Celpare, on the page you
  were on, as a guest. Never the landing page, which is what redirect("/") did.

  A page that only exists for an account (your own profile, settings, messages
  and the rest below) has nothing to show a guest, so those go to Ask Celpare,
  the home since D267, instead. Everything else (a post, a tool, a public profile, Explore,
  Compare) reads the same signed out, so you stay on it.

  The page comes from the Referer header, so it is untrusted input: only a path
  on our own origin is accepted, anything else falls back to Ask.
*/

const FALLBACK = "/ask";

/* Prefixes that mean "this page is your account". Matched on whole segments,
   so /profile matches /profile and /profile/edit but not /profiles-of-x. */
const ACCOUNT_ONLY = [
  "/profile",
  "/settings",
  "/messages",
  "/notifications",
  "/welcome",
  "/developer",
  "/admin",
  "/app",
  "/plans",
  "/community/new",
];

/* Pages a guest should not be sent back to either: the landing page, and the
   sign in pages (logging out onto a login form reads as an error). */
const NEVER = ["/", "/login", "/signup", "/verify", "/get-started", "/forgot-password", "/reset-password"];

function under(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

export function afterSignOutPath(referer: string | null | undefined, origin: string): string {
  if (!referer) return FALLBACK;
  let url: URL;
  try {
    url = new URL(referer);
  } catch {
    return FALLBACK;
  }
  if (url.origin !== origin) return FALLBACK;

  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (NEVER.includes(path)) return FALLBACK;
  if (ACCOUNT_ONLY.some((p) => under(path, p))) return FALLBACK;

  return `${path}${url.search}`;
}
