import type { Doc } from "../types";

/*
  Cookie Policy, version 1.0 (phase LEGAL, 2026-10-07). The table is the real
  list: names and lifetimes come from src/lib/auth/after-login.ts,
  src/lib/auth/second-factor.ts, src/lib/ai/identity.ts,
  src/lib/community/intelligence/seen.ts and @supabase/ssr. Add a cookie, add
  a row.
*/

export const cookies: Doc = {
  slug: "cookies",
  title: "Cookie Policy",
  description: "Every cookie and browser storage item Celpare uses, what it is for and how long it lasts.",
  version: "1.0",
  effective: "2026-10-07",
  summary: [
    "Celpare uses only its own cookies, and only ones it needs to work.",
    "There are no advertising, analytics or third party tracking cookies, which is why there is no cookie banner.",
  ],
  sections: [
    {
      id: "cookies",
      heading: "1. Cookies",
      blocks: [
        "A cookie is a small file a website stores in your browser. All of these are set by celpare.com, are sent only to celpare.com, and cannot be read by other sites. They are strictly necessary for a part of Celpare to work, so the law does not require your consent for them.",
        {
          table: {
            head: ["Name", "What it does", "How long"],
            rows: [
              ["sb-...-auth-token", "Keeps you signed in (set by our sign in provider, Supabase)", "Until you log out, renewed while you use Celpare"],
              ["cp_login_pending", "Remembers that your password was right while you enter the emailed login code", "15 minutes"],
              ["cp_2fa", "Remembers that this browser passed the login code step", "30 days"],
              ["cp_recovery", "Allows a password reset only in the browser that opened the reset link", "30 minutes"],
              ["cp_device", "A random id for this browser, so we can email you when your account is used from a new one", "400 days"],
              ["celpare_anon", "A random, signed id used when you are signed out: it applies the daily question limit to Ask Celpare, and limits how often the same sponsored tool is shown to you. It is not linked to any account", "180 days"],
              ["cp_seen", "The last posts you saw in the feed, so they are not shown again straight away", "2 days"],
            ],
          },
        },
      ],
    },
    {
      id: "storage",
      heading: "2. Other browser storage",
      blocks: [
        {
          table: {
            head: ["Where", "What it does", "How long"],
            rows: [
              ["localStorage: theme", "Your light, dark or system choice", "Until you clear it"],
              ["sessionStorage", "A random id for the current tab, used to count feed, video, Explore and recommendation impressions once", "Until the tab closes"],
            ],
          },
        },
        "The bot check on sign up and some forms is Cloudflare Turnstile. It runs in a frame from challenges.cloudflare.com and may store its own data to tell people from bots; Cloudflare's [privacy policy](https://www.cloudflare.com/privacypolicy/) applies to it.",
      ],
    },
    {
      id: "control",
      heading: "3. Your choices",
      blocks: [
        "You can delete or block cookies in your browser settings. If you block them, you cannot sign in and some features will not work. Logging out removes the sign in cookies.",
        "Questions: see the [Privacy Policy](/legal/privacy#contact).",
      ],
    },
  ],
  changes: [{ version: "1.0", date: "2026-10-07", note: "First version." }],
};
