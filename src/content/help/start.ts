import type { Doc } from "../types";

/* Help: getting started, your account and data, plans (phase LEGAL, 2026-10-07). Describes what is built today. */

export const gettingStarted: Doc = {
  slug: "getting-started",
  title: "Getting started",
  description: "What Celpare is, how to create an account, and where everything lives.",
  version: "1.0",
  effective: "2026-10-07",
  summary: [
    "Celpare helps you find the right AI tool or model for what you want to get done: discover, search, explore, ask, compare, choose, use and share.",
  ],
  sections: [
    {
      id: "account",
      heading: "Create an account",
      blocks: [
        {
          steps: [
            "Choose Sign up, then continue with Google, or with your name, email and a password.",
            "With email, enter the 6 digit code we send to confirm the address.",
            "From then on, logging in with a password also asks for a code from your email. Logging in with Google is one step.",
          ],
        },
        "You can browse the community feed, tools and models without an account, and ask Ask Celpare a few questions a day. Posting, saving, following and messaging need an account. You must be 13 or older, and under 18 you need a parent's or guardian's permission ([Terms](/legal/terms#eligibility)).",
      ],
    },
    {
      id: "map",
      heading: "Where things are",
      blocks: [
        {
          table: {
            head: ["Section", "What it is for"],
            rows: [
              ["[Community](/help/community)", "The home feed: posts, videos, comments and the people you follow"],
              ["[Ask Celpare](/help/ask-celpare)", "Ask which tool or model fits a task, with sources"],
              ["[Search](/help/search)", "Find a specific tool, model, post or person"],
              ["[Explore](/help/explore)", "Browse what is trending, rising and new"],
              ["[Compare](/help/compare)", "Put 2 to 6 tools or models side by side, with evidence"],
              ["[Messages](/help/messages)", "Private conversations with your friends"],
              ["[Profile and Settings](/help/profile-and-privacy)", "Who you are on Celpare, privacy, and your data"],
            ],
          },
        },
      ],
    },
  ],
};

export const yourData: Doc = {
  slug: "your-data",
  title: "Your data and account",
  description: "Change your password or email, download everything Celpare holds about you, or delete your account.",
  version: "1.0",
  effective: "2026-10-07",
  sections: [
    {
      id: "password-email",
      heading: "Password and email",
      blocks: [
        "In [Settings](/settings), Password and email: both changes are confirmed by an emailed link. Saving a new password signs out every device. A new email address must be confirmed from both the old and the new inbox.",
        "Forgot your password? Choose Forgot password? on the login page.",
      ],
    },
    {
      id: "download",
      heading: "Download my data",
      blocks: [
        "In [Settings](/settings#your-data), choose Download my data. You get one JSON file with your profile, posts, comments, likes, follows, saved items, collections, Ask Celpare chats, direct messages, searches, the tools and models you viewed, notifications, devices and, for developers, your listings.",
      ],
    },
    {
      id: "delete",
      heading: "Delete your account",
      blocks: [
        {
          steps: [
            "In [Settings](/settings#your-data), under Delete account, choose to email a code.",
            "Enter the 6 digit code and type delete my account.",
            "Choose Delete my account forever.",
          ],
        },
        "Your profile, posts, comments, messages, chats, saved items and uploaded files are deleted straight away, and you get a confirmation email. Search and view records remain only as anonymous statistics. Tools you listed as a developer stay in the catalogue without an owner; ask us first if you want one removed. Details are in the [Privacy Policy](/legal/privacy#retention).",
      ],
    },
  ],
};

export const plans: Doc = {
  slug: "plans",
  title: "Plans",
  description: "What the Free plan includes, and the paid plans that are coming.",
  version: "1.0",
  effective: "2026-10-07",
  sections: [
    {
      id: "today",
      heading: "Today",
      blocks: [
        "Everyone is on the Free plan. Your plan and your daily Ask Celpare allowance are shown at the top of [Settings](/settings). The allowance resets at midnight.",
        "Signed out, you can ask a few questions a day without an account. Nothing you ask while signed out is saved.",
      ],
    },
    {
      id: "paid",
      heading: "Paid plans",
      blocks: [
        "The [pricing page](/pricing) shows Pro and Premium for individuals, and Pro and Elite for developers. They show Coming soon and cannot be bought yet. When they open, the [Paid Plans Terms](/legal/paid-plans) apply, including a full refund within 14 days of your first payment.",
      ],
    },
  ],
};
