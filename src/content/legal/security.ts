import type { Doc } from "../types";
import { OPERATOR } from "../operator";

/*
  Security, version 1.0 (phase LEGAL, 2026-10-07). Only measures that exist:
  RLS everywhere with nothing granted by default (D119), server only secrets
  (hard rule 4), Turnstile, password then emailed code (D188) with a wrong code
  limit (D189), new login emails (D192), private DM buckets checked as bytes
  (D124), rate limits (D37, D120, D121), the append only admin audit log,
  security headers (next.config.ts), Sentry without content (D82).
*/

export const security: Doc = {
  slug: "security",
  title: "Security",
  description: "How Celpare protects accounts and data, and how to report a vulnerability.",
  version: "1.0",
  effective: "2026-10-07",
  summary: [
    "Access to data is enforced by the database on every table, not only by the app.",
    "Logging in with a password also needs a code sent to your email, and a login from a new browser is emailed to you.",
    `Found a vulnerability? Email [${OPERATOR.security}](mailto:${OPERATOR.security}). Please do not test on other people's accounts.`,
  ],
  sections: [
    {
      id: "accounts",
      heading: "1. Your account",
      blocks: [
        {
          list: [
            "Passwords are never stored by Celpare; our authentication provider stores only a salted hash.",
            "After a correct password, a 6 digit code is emailed to you before you are signed in. Four wrong codes lock that code.",
            "A bot check (Cloudflare Turnstile) protects sign up.",
            "When your account is used from a browser it has not seen before, we email you.",
            "Changing your password signs out every device. Password and email changes are confirmed by email.",
          ],
        },
      ],
    },
    {
      id: "data",
      heading: "2. Your data",
      blocks: [
        {
          list: [
            "Row level security is on for every table. New tables start with no access for anyone until access is granted deliberately.",
            "Private fields, such as your email address, cannot be read by other accounts at all.",
            "Message attachments are stored privately, readable only by the people in the conversation, and checked by their bytes when sent. Files are never run or previewed by our server.",
            "Secret keys stay on our servers and never reach your browser.",
            "Error monitoring never receives the content of your posts, messages or questions.",
            "Data is encrypted in transit (HTTPS, with HSTS) and our hosting providers encrypt it at rest.",
          ],
        },
      ],
    },
    {
      id: "platform",
      heading: "3. The platform",
      blocks: [
        {
          list: [
            "Rate limits protect sign in, emails, Ask Celpare and public endpoints from abuse.",
            "Security headers stop other sites from framing Celpare and browsers from guessing file types.",
            "Every action in the admin dashboard is written to an audit log that cannot be edited or deleted.",
            "Every code change is scanned for leaked secrets before it is committed.",
          ],
        },
      ],
    },
    {
      id: "report",
      heading: "4. Reporting a vulnerability",
      blocks: [
        `Email [${OPERATOR.security}](mailto:${OPERATOR.security}) with what you found and how to reproduce it. We will reply, keep you updated, and credit you if you wish.`,
        {
          list: [
            "Test only against your own accounts and data.",
            "Do not access, change or delete other people's data, and stop as soon as you reach any.",
            "Do not degrade the service: no denial of service, spam or social engineering.",
            "Give us reasonable time to fix the issue before you share it.",
          ],
        },
        "If you follow these rules in good faith, we will not take legal action against you for your research.",
      ],
    },
  ],
  changes: [{ version: "1.0", date: "2026-10-07", note: "First version." }],
};
