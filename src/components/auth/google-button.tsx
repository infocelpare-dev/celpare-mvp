/* Google mark. Inlined rather than loaded from a CDN so it works offline and
   cannot be blocked. The colours are Google's and must not be restyled. */
function GoogleIcon() {
  return (
    <svg viewBox="0 0 18 18" className="h-[18px] w-[18px]" aria-hidden>
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

/*
  Continue with Google: one tap, one full page redirect to Google (founder,
  2026-11-09). It replaced Google's own popup button (Google Identity Services),
  which opened a chooser over the page instead of going to Google.

  A plain link to /auth/google/start, so it needs no JavaScript and no third
  party script. The server picks the flow: our own redirect on celpare.com when
  GOOGLE_CLIENT_SECRET is set, otherwise Supabase's (lib/auth/google-oauth.ts).
  A plain anchor, not next/link: this is a top level navigation that leaves the
  site, and the router must not try to fetch it as a page.
*/
export function GoogleButton({ label, next }: { label: string; next?: string }) {
  const href = next ? `/auth/google/start?next=${encodeURIComponent(next)}` : "/auth/google/start";
  return (
    <a
      href={href}
      rel="nofollow"
      className="flex h-11 w-full cursor-pointer items-center justify-center gap-3 rounded-xl border border-border bg-background text-[15px] font-medium text-foreground transition-colors duration-200 ease-out hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
    >
      <GoogleIcon />
      {label}
    </a>
  );
}

export function AuthDivider() {
  return (
    <div className="my-6 flex items-center gap-4">
      <span className="h-px flex-1 bg-border" />
      <span className="text-[13px] text-muted">or</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
