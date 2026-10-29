import type { Doc } from "../types";

/*
  Subprocessors, version 1.0 (phase LEGAL, 2026-10-07). Regions checked on
  2026-10-07: Supabase eu-west-1, Upstash eu-west-1 (console), Resend sending
  region eu-west-1, Sentry de.sentry.io. Serper publishes no location.
*/

export const subprocessors: Doc = {
  slug: "subprocessors",
  title: "Subprocessors",
  description: "Every company that processes personal data for Celpare, what it receives, and where.",
  version: "1.0",
  effective: "2026-10-07",
  summary: [
    "These are the service providers Celpare uses to run. Each receives only what it needs for its job.",
    "When this list changes, the version and date above change.",
  ],
  sections: [
    {
      id: "list",
      heading: "1. Current subprocessors",
      blocks: [
        {
          table: {
            head: ["Company", "Purpose", "Personal data it receives", "Location"],
            rows: [
              ["Supabase", "Database, authentication and file storage", "All account data, content, messages and files described in the [Privacy Policy](/legal/privacy)", "Ireland (EU), AWS eu-west-1"],
              ["OpenRouter, and the AI model provider it routes to", "Writing Ask Celpare answers", "Questions, recent chat messages and retrieved facts. No name, email or account id", "United States"],
              ["Serper", "Web search for Ask Celpare", "Search terms, only when web search runs", "Outside the EU, location not published"],
              ["Upstash", "Rate limits and counters", "Hashed keys derived from account ids, cookies and network addresses", "Ireland (EU), eu-west-1"],
              ["Sentry", "Error and performance monitoring", "Technical details of errors, browser and page. No content, request bodies or cookies", "Germany (EU)"],
              ["Resend", "Sending account and notification emails", "Email address, name, and the email content", "Sending region Ireland (EU)"],
              ["Forward Email", "Receiving email sent to celpare.com addresses and forwarding it to Celpare", "Whatever you write to us", "United States"],
              ["Cloudflare", "Domain name service, Turnstile bot check, and hosting once Celpare is live", "Network address and browser signals for the bot check; request data for hosting", "Global network"],
              ["Google Cloud", "Turning voice search recordings into text, only when voice search is switched on and you press the microphone", "The recording, briefly. Not stored by Celpare. No name, email or account id", "EU (eu multi-region) for English, Netherlands (europe-west4) for Somali"],
              ["Google", "Sign in with Google, when you choose it", "Google confirms your identity and shares your name, email and picture with Celpare", "Global"],
            ],
          },
        },
      ],
    },
    {
      id: "links",
      heading: "2. Their privacy policies",
      blocks: [
        {
          list: [
            "[Supabase](https://supabase.com/privacy)",
            "[OpenRouter](https://openrouter.ai/privacy)",
            "[Serper](https://serper.dev/privacy)",
            "[Upstash](https://upstash.com/trust/privacy.pdf)",
            "[Sentry](https://sentry.io/privacy/)",
            "[Resend](https://resend.com/legal/privacy-policy)",
            "[Forward Email](https://forwardemail.net/en/privacy)",
            "[Cloudflare](https://www.cloudflare.com/privacypolicy/)",
            "[Google](https://policies.google.com/privacy)",
          ],
        },
      ],
    },
  ],
  changes: [{ version: "1.0", date: "2026-10-07", note: "First version." }],
};
