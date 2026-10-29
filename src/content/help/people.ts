import type { Doc } from "../types";

/* Help: community, messages, profile and privacy, notifications (phase LEGAL, 2026-10-07). D27, D86, D123, D124, 4BH. */

export const community: Doc = {
  slug: "community",
  title: "Community and posting",
  description: "The feed, posting, videos, comments, reposts and insights on your own posts.",
  version: "1.0",
  effective: "2026-10-07",
  sections: [
    {
      id: "feed",
      heading: "The feed",
      blocks: [
        "[Community](/community) is the home of Celpare. Top ranks posts for you, weighing conversation, the people you follow and what you have not seen yet. Latest shows the newest first. Following shows only the people you follow. Videos open in a full screen vertical viewer.",
        "Shape it with Not interested on a post, and by muting a person or topic.",
      ],
    },
    {
      id: "posting",
      heading: "Posting",
      blocks: [
        "Write a post with text, up to four photos, or a video. Use #hashtags for topics and @username to mention someone, who is then notified. Posts are public, so anyone can read them.",
        "Every post can be liked, commented on, reposted, saved and reported. You can delete your own posts and comments.",
        "Your own posts have an insights page showing their views and how they are spreading. Only you can see it.",
      ],
    },
    {
      id: "rules",
      heading: "Rules",
      blocks: ["Follow the [Community Guidelines](/legal/community-guidelines) and the [Acceptable Use Policy](/legal/acceptable-use)."],
    },
  ],
};

export const messages: Doc = {
  slug: "messages",
  title: "Messages and friends",
  description: "Private conversations with your friends: text, photos, videos and files.",
  version: "1.0",
  effective: "2026-10-07",
  sections: [
    {
      id: "friends",
      heading: "Friends",
      blocks: [
        "When you follow someone and they follow you back, you are friends. You can start a conversation only with a friend, so nobody can message you out of the blue.",
      ],
    },
    {
      id: "sending",
      heading: "What you can send",
      blocks: [
        {
          table: {
            head: ["Type", "Limit"],
            rows: [
              ["Text", "Any message"],
              ["Photos", "Up to 5 MB each"],
              ["Videos", "Up to 25 MB each"],
              ["TXT or CSV files", "Up to 1 MB each"],
            ],
          },
        },
        "Attachments are stored privately and only the people in the conversation can open them. Files are checked by their contents when sent and are never run by Celpare.",
      ],
    },
  ],
};

export const profileAndPrivacy: Doc = {
  slug: "profile-and-privacy",
  title: "Profile and privacy",
  description: "Edit your profile, follow people, and choose what visitors can see.",
  version: "1.0",
  effective: "2026-10-07",
  sections: [
    {
      id: "profile",
      heading: "Your profile",
      blocks: [
        "Your profile shows your name, username, picture, bio, and your posts. Edit it from your profile. Your email is never shown.",
        "You can feature favourite tools and models on your profile, and keep saved tools, models and collections for yourself.",
      ],
    },
    {
      id: "privacy",
      heading: "Privacy settings",
      blocks: [
        "In the Privacy section of [Settings](/settings), make your account private, and choose whether visitors can see your replies, who you follow and who follows you, and your saved tools and models. These are enforced by the database, not just hidden on the page.",
        "Your searches and the tools you opened are never shown to anyone. Clear them under Recent activity.",
      ],
    },
  ],
};

export const notifications: Doc = {
  slug: "notifications",
  title: "Notifications",
  description: "What the bell tells you about, and how to switch kinds off.",
  version: "1.0",
  effective: "2026-10-07",
  sections: [
    {
      id: "kinds",
      heading: "What you are notified about",
      blocks: [
        {
          list: [
            "Likes, comments, replies and reposts on your posts, grouped per post per day.",
            "New followers, and when someone follows you back and you become friends.",
            "Mentions of your @username.",
            "Your post passing a views milestone, or starting to trend.",
          ],
        },
        "Switch any kind off in the Notifications section of [Settings](/settings). Nobody is told what you switch off.",
      ],
    },
    {
      id: "email",
      heading: "Emails",
      blocks: [
        "Celpare emails you about your account: login codes, a login from a new browser, password and email changes, a welcome, and decisions on tools you submit. Some activity emails, such as a new follower, can be switched off in Settings.",
      ],
    },
  ],
};
