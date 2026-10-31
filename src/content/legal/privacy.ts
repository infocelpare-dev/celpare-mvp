import type { Doc } from "../types";
import { OPERATOR } from "../operator";

/*
  Privacy Policy, version 1.0 (phase LEGAL, 2026-10-07). Every factual sentence
  maps to code or configuration that was checked on 2026-10-07; the claim audit
  is in docs/context/19-legal.md. Change the code and this page together.
*/

export const privacy: Doc = {
  slug: "privacy",
  title: "Privacy Policy",
  description:
    "What personal data Celpare collects, why, who processes it, how long it is kept, and how to see, download or delete it.",
  version: "1.1",
  effective: "2026-10-31",
  summary: [
    "We collect what you give us (your account, profile, posts, messages and questions) and what using Celpare produces (searches, views, devices). We do not sell it and we run no advertising trackers.",
    "Your posts, comments and public profile are visible to anyone. Your email, messages, Ask Celpare chats, searches and devices are not.",
    "Questions you ask Ask Celpare are sent to an AI model provider to be answered. That provider may log them to improve its products, without your name or account. Read [AI and your data](/legal/ai-data).",
    "You can download all your data or delete your account yourself, in [Settings](/settings#your-data).",
    `Celpare is run from Kenya and its database is hosted in Ireland. The Kenya Data Protection Act 2019 applies, and so does the EU GDPR when you are in the EU or EEA.`,
  ],
  sections: [
    {
      id: "who-we-are",
      heading: "1. Who we are",
      blocks: [
        `Celpare ("Celpare", "we", "us") is a platform for discovering, comparing and choosing AI tools and models, with a community. It is operated by ${OPERATOR.legalName}, ${OPERATOR.address}, ${OPERATOR.country}. Celpare is not yet a registered company; when it is, this page will name the company.`,
        `For the purposes of the Kenya Data Protection Act 2019 and the EU General Data Protection Regulation (GDPR), Celpare is the data controller of the personal data described here. Contact us about privacy at [${OPERATOR.privacy}](mailto:${OPERATOR.privacy}).`,
        "This policy covers celpare.com, the Celpare app at the same address, the emails we send, and Ask Celpare. It does not cover the third party tools listed in the Celpare catalogue: when you leave Celpare for a tool's website, that tool's own privacy policy applies.",
      ],
    },
    {
      id: "what-we-collect",
      heading: "2. What we collect",
      blocks: [
        "**What you give us**",
        {
          list: [
            "Account: your name, email address and password (stored only as a hash by our authentication provider). If you sign in with Google, Google shares your name, email address and profile picture with us.",
            "Profile: username, bio, location, website, interests, skills, profile picture, and your privacy choices. Whatever you put in your profile is yours to leave blank.",
            "Questions after sign up: what best describes you, what you want to do on Celpare, the categories and topics you are interested in, the AI tools you already use, and where you heard about Celpare. Every question can be skipped. Your answers are private: they are not on your profile, and you can change them in Settings.",
            "Content: posts, photos and videos, comments, replies, likes, reposts, saves, follows, collections, reviews and reactions to tools.",
            "Direct messages: the text, photos, videos, voice notes and TXT or CSV files you send, and who you send them to.",
            "Ask Celpare: the questions you ask and the answers you receive. If you are signed in and have history switched on, the conversation is saved to your account. If you are signed out, nothing is saved.",
            "Developers: your developer profile, the tools and models you submit with their descriptions, media, links and contact email, verification requests, launches, and sponsorship requests.",
            "Reports you file about content or tools, and anything you write to us by email.",
            "The waitlist and demo request forms: your email address.",
          ],
        },
        "**What using Celpare produces**",
        {
          list: [
            "Searches you make, and which tools, models and posts you open, compare, save or pass over. We use these to show you your recent activity and to rank what you see.",
            "Feed activity: which posts were shown to you, which you viewed and for how long, and feedback such as Not interested or muting a person or topic. A view also adds one to the post's public view count.",
            "Voice search: only when you press the microphone in search. If voice search is switched on for signed in accounts, your recording is sent to Google Cloud Speech-to-Text (in the EU for English, the Netherlands for Somali) to be turned into text, then discarded: Celpare does not store the audio or the transcript, and has not opted in to Google's speech data logging, so Google uses the audio only to provide the transcription. Otherwise your browser's own speech recognition is used, which in Chrome and Edge sends the audio to Google or Microsoft under their terms. Either way Celpare receives only the text, and it is searched like typed text.",
            "Comment activity: which comments were shown to you and in what position, and comments you liked, replied to, hid, marked Not interested or reported. We use these only to order comments for you. Nobody else can see them.",
            "Ask Celpare usage: how many questions you asked, which features were used (catalogue search, web search, research) and the size of each answer, so plan limits can be applied.",
            "Devices and security: a random browser id stored in a cookie, the browser and operating system from your user agent, and for security events the IP address. We use these to tell you about a new login (that email shows the browser and a partly masked network address) and to protect accounts.",
            "Errors: if something breaks, an error report with technical details about the page and browser. It never includes the content of your posts, messages or questions.",
          ],
        },
        "**What we do not collect**",
        {
          list: [
            "We do not use analytics or advertising trackers, and we do not build an advertising profile of you.",
            "We do not collect your precise location, contacts, or payment card details. Paid plans are not on sale yet; when they are, payments will be handled by a payment provider named here first.",
            "We do not ask for your date of birth.",
          ],
        },
      ],
    },
    {
      id: "why-we-use-it",
      heading: "3. Why we use it, and on what basis",
      blocks: [
        "Data protection law asks us to name a lawful basis for each use. Ours are:",
        {
          table: {
            head: ["What we do", "Data used", "Lawful basis"],
            rows: [
              ["Create and run your account, sign you in, send login codes", "Account, devices", "Performance of our contract with you (the [Terms](/legal/terms))"],
              ["Show your profile and content to others, deliver messages", "Profile, content, messages", "Performance of contract"],
              ["Answer your Ask Celpare questions and keep your chat history", "Questions, answers, usage", "Performance of contract"],
              ["Rank the feed, Explore, Search and recommendations for you", "Activity, follows, feedback, and your answers to the questions after sign up", "Our legitimate interest in showing relevant content. You can use Not interested, mute and privacy settings, change your answers in Settings, and object (section 8)"],
              ["Understand how people find Celpare and who it serves", "Your answers to the questions after sign up, counted together with everyone else's", "Our legitimate interest in growing Celpare. Staff see totals, never one person's answers"],
              ["Limit usage per plan and stop abuse, spam and automated traffic", "Usage, hashed network address, captcha result", "Legitimate interest in keeping Celpare available and safe"],
              ["Alert you to a new login and protect accounts", "Devices, security events", "Legitimate interest in security"],
              ["Find and fix errors", "Error reports", "Legitimate interest in a working service"],
              ["Review developer submissions and verify tools", "Developer data", "Performance of contract"],
              ["Moderate reported content and enforce the [Acceptable Use Policy](/legal/acceptable-use)", "Content, reports", "Legitimate interest in a safe community"],
              ["Email you about your account, and notifications you have switched on", "Email, preferences", "Performance of contract. Notification emails can be switched off in Settings"],
              ["Contact you about the waitlist or a demo you asked for", "Email", "Your consent, which you can withdraw at any time"],
              ["Keep records the law requires, and respond to lawful requests", "As required", "Legal obligation"],
            ],
          },
        },
        "We do not use your personal data to make decisions that have legal or similarly significant effects on you by automated means alone. Rankings and recommendations are automated, but they decide only the order of what you see. Content that receives three reports is hidden automatically until a person reviews it.",
      ],
    },
    {
      id: "who-can-see-it",
      heading: "4. What others can see",
      blocks: [
        {
          list: [
            "Public by default: your name, username, picture, bio, and your posts, comments and reposts. The community feed can be read without an account.",
            "If you make your account private, what others can see is limited as described in [Settings](/settings). Some lists, such as who you follow and your saved tools, have their own switches.",
            "Never shown to others: your email address, your direct messages (only the people in the conversation can read them), your Ask Celpare chats, your searches and the tools you viewed, your devices.",
            "Social proof is counts only: someone may see that 2 people they follow commented on a post, never a list of who liked it.",
            "View counts on posts are public numbers. They never show who viewed.",
            "Developers see aggregate statistics for their own listings, including the search terms people used before opening them. They never see who searched or viewed.",
          ],
        },
        "Inside Celpare, access to stored data is enforced by database rules, not only by what the app chooses to display. Our servers hold one administrative key that can bypass those rules; we use it only to run the service (for example to send notifications, compute rankings and process deletions), to investigate a report, or when the law requires.",
      ],
    },
    {
      id: "processors",
      heading: "5. Who processes it for us",
      blocks: [
        "We use these service providers. Each processes personal data only to provide its service to Celpare. The full list, with what each receives, is on the [Subprocessors](/legal/subprocessors) page.",
        {
          table: {
            head: ["Provider", "What for", "Where"],
            rows: [
              ["Supabase", "Database, sign in, file storage", "Ireland (EU)"],
              ["AI model provider, reached through OpenRouter", "Answering Ask Celpare questions", "United States"],
              ["Serper", "Web search for Ask Celpare, when a question needs current information", "Outside the EU, location not published"],
              ["Upstash", "Rate limits, using hashed keys", "Ireland (EU)"],
              ["Sentry", "Error reports, without content", "Germany (EU)"],
              ["Resend", "Sending emails", "Ireland (EU) sending region"],
              ["Forward Email", "Receiving email sent to celpare.com addresses", "United States"],
              ["Cloudflare", "Domain, bot check (Turnstile), and hosting once Celpare is live", "Global network"],
              ["Google", "Sign in with Google, if you choose it", "Global"],
            ],
          },
        },
        "We do not sell or rent personal data. We do not share it with advertisers. Sponsored tools are chosen by what you searched for or asked, not by a profile of you, and sponsors will receive only aggregate counts such as views and clicks, never who you are.",
        "We may disclose data if the law requires it, to protect someone's safety, or as part of a transfer of Celpare to a new operator, in which case this policy continues to apply to it.",
      ],
    },
    {
      id: "transfers",
      heading: "6. Transfers outside Kenya and the EU",
      blocks: [
        "Celpare is run from Kenya, our database is in Ireland, and some providers are in the United States. Your data therefore leaves the country you are in.",
        "Under section 48 of the Kenya Data Protection Act 2019 and Chapter V of the GDPR, we transfer data only to providers who protect it. Where a provider offers a data processing agreement with the European Commission's Standard Contractual Clauses, we rely on it. Ireland and Germany are in the EU and covered by the GDPR directly.",
      ],
    },
    {
      id: "retention",
      heading: "7. How long we keep it",
      blocks: [
        {
          table: {
            head: ["Data", "Kept"],
            rows: [
              ["Account and profile", "Until you delete your account"],
              ["Posts, comments, messages, saves, collections", "Until you delete them, or your account"],
              ["Ask Celpare chats", "Until you delete the chat or your account. Signed out questions, and questions with history switched off, are not saved"],
              ["Searches, views and feed activity", "While your account exists. When you delete it, these records are kept only with your account removed from them, as anonymous statistics"],
              ["Devices and security events", "While your account exists, deleted with it"],
              ["Ask Celpare usage records (plan, features used, answer size)", "While your account exists, deleted with it"],
              ["Rate limit counters", "Hours to one day, under hashed keys"],
              ["Error reports", "As long as Sentry keeps them for our plan, at most 90 days"],
              ["Email delivery logs", "As long as Resend keeps them for our plan"],
              ["Waitlist and demo request emails", "Until launch communications end, or you ask us to delete them"],
              ["Records of admin and moderation actions", "Kept, because they show how decisions about content and accounts were made"],
              ["Tools you listed as a developer", "They stay in the catalogue without an owner after you delete your account, with your contact email removed"],
            ],
          },
        },
        "Deleted data can remain in our hosting provider's backups for a short time until those backups expire.",
      ],
    },
    {
      id: "your-rights",
      heading: "8. Your rights",
      blocks: [
        "Under the Kenya Data Protection Act 2019 (sections 26, 35 and 38) and, where it applies, the GDPR, you have the right to:",
        {
          list: [
            "Be informed about how your data is used, which is what this page is for.",
            "Access your data, and receive it in a portable, machine readable form. Use **Download my data** in [Settings](/settings#your-data).",
            "Correct it. Edit your profile, or ask us.",
            "Delete it. Use **Delete account** in [Settings](/settings#your-data). Single posts, comments, messages and chats can be deleted where they appear.",
            "Object to processing based on legitimate interest, including ranking, and restrict processing while a complaint is considered.",
            "Withdraw consent at any time, where we rely on it.",
            "Not be subject to a decision based solely on automated processing that significantly affects you.",
          ],
        },
        `For anything Settings cannot do, email [${OPERATOR.privacy}](mailto:${OPERATOR.privacy}) from the address on your account. We answer within 30 days. We may ask you to confirm your identity first.`,
        "If you are not satisfied, you can complain to the Office of the Data Protection Commissioner in Kenya ([odpc.go.ke](https://www.odpc.go.ke)), or, if you are in the EU or EEA, to the data protection authority where you live or work.",
      ],
    },
    {
      id: "security",
      heading: "9. Security",
      blocks: [
        "We protect data with database level access rules on every table, secrets kept only on our servers, a bot check on sign up, a login code emailed after your password, alerts for logins from a new browser, private storage for message attachments, and rate limits. The [Security](/legal/security) page has the detail and tells you how to report a vulnerability.",
        "No system is perfectly secure. If a breach affects your personal data, we will tell you and the relevant authority as the law requires, which in Kenya and the EU is within 72 hours of becoming aware of it where a notification is required.",
      ],
    },
    {
      id: "children",
      heading: "10. Children",
      blocks: [
        "Celpare is not for children under 13, and we do not knowingly collect data from them. If we learn that an account belongs to someone under 13, we delete it.",
        "If you are 13 to 17, you may use Celpare only with the permission of a parent or guardian, who should read this policy with you. A parent or guardian can ask us to delete a child's account by emailing us.",
      ],
    },
    {
      id: "cookies",
      heading: "11. Cookies",
      blocks: [
        "Celpare uses only first party cookies that are needed for it to work: signing in, the login code step, password reset, the anonymous question limit, new login alerts, and remembering which feed posts you have already seen. There are no advertising or analytics cookies, so there is no cookie banner. The full list is in the [Cookie Policy](/legal/cookies).",
      ],
    },
    {
      id: "changes",
      heading: "12. Changes to this policy",
      blocks: [
        "When this policy changes, the version and date at the top change, and the change is listed at the bottom. If a change is significant, we will tell you by email or in the app before it takes effect.",
      ],
    },
    {
      id: "contact",
      heading: "13. Contact",
      blocks: [
        `${OPERATOR.brand}, ${OPERATOR.legalName}, ${OPERATOR.address}, ${OPERATOR.country}. Email [${OPERATOR.privacy}](mailto:${OPERATOR.privacy}).`,
      ],
    },
  ],
  changes: [
    { version: "1.1", date: "2026-10-31", note: "Added the questions after sign up: what we ask, why, and that every answer is optional and private." },
    { version: "1.0", date: "2026-10-07", note: "First version." },
  ],
};
