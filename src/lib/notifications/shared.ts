/*
  Notifications, the parts both the server and the browser need: the row shape
  my_notifications() returns, the sentence for each kind, and where a row goes.
  docs/context/14-notifications.md, D147.

  Every number in a sentence is the one the database recomputed from the source
  rows on read (an unlike drops out of "and 4 others"). Nothing is rounded up,
  estimated or invented (D13).
*/

export type NotificationKind =
  | "like"
  | "comment"
  | "reply"
  | "repost"
  | "follow"
  | "friend"
  | "mention"
  | "post_milestone"
  | "post_lifecycle";

export type NotificationActor = {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
};

export type NotificationRow = {
  id: string;
  kind: NotificationKind;
  updated_at: string;
  read_at: string | null;
  actor_count: number;
  actors: NotificationActor[];
  post_id: string | null;
  post_excerpt: string | null;
  post_kind: string | null;
  comment_id: string | null;
  comment_excerpt: string | null;
  data: { views?: number; stage?: string; day?: string } | null;
};

/* The preference keys, in the order Settings shows them. */
export const NOTIFICATION_PREFERENCES = [
  { key: "likes", label: "Likes", on: "You hear when somebody likes your post.", off: "Likes are not notified." },
  { key: "comments", label: "Comments", on: "You hear when somebody comments on your post.", off: "Comments are not notified." },
  { key: "replies", label: "Replies", on: "You hear when somebody replies to your comment.", off: "Replies are not notified." },
  { key: "reposts", label: "Reposts", on: "You hear when somebody reposts your post.", off: "Reposts are not notified." },
  { key: "follows", label: "New followers", on: "You hear when somebody follows you or follows you back.", off: "New followers are not notified." },
  { key: "mentions", label: "Mentions", on: "You hear when somebody mentions you in a post.", off: "Mentions are not notified." },
  {
    key: "performance",
    label: "How your posts are doing",
    on: "You hear when a post picks up or passes a number of views. At most three per post.",
    off: "Post performance is not notified. Insights on each post still show it.",
  },
] as const;

export type NotificationPreferenceKey = (typeof NOTIFICATION_PREFERENCES)[number]["key"];
export type NotificationPreferences = Record<NotificationPreferenceKey, boolean>;

function nameOf(a: NotificationActor | undefined): string {
  if (!a) return "Someone";
  return a.full_name?.trim() || (a.username ? `@${a.username}` : "Someone");
}

/* "Ana", "Ana and Sam", "Ana and 3 others". */
function who(n: NotificationRow): string {
  const first = nameOf(n.actors[0]);
  const count = Math.max(n.actor_count, n.actors.length);
  if (count <= 1) return first;
  if (count === 2 && n.actors[1]) return `${first} and ${nameOf(n.actors[1])}`;
  const others = count - 1;
  return `${first} and ${others} ${others === 1 ? "other" : "others"}`;
}

const LIFECYCLE_SENTENCE: Record<string, string> = {
  promising: "Your post is picking up. People responded well, so it is being shown more widely.",
  accelerating: "Your post is gaining speed.",
  trending: "Your post is trending on Celpare.",
  viral: "Your post is reaching far more people than usual.",
};

export function describeNotification(n: NotificationRow): string {
  const post = n.post_kind === "video" ? "video" : "post";
  switch (n.kind) {
    case "like":
      return `${who(n)} liked your ${post}`;
    case "comment":
      return `${who(n)} commented on your ${post}`;
    case "reply":
      return `${who(n)} replied to your comment`;
    case "repost":
      return `${who(n)} reposted your ${post}`;
    case "follow":
      return `${who(n)} followed you`;
    case "friend":
      return `${who(n)} followed you back. You are friends now`;
    case "mention":
      return `${who(n)} mentioned you`;
    case "post_milestone":
      return `Your ${post} passed ${(n.data?.views ?? 0).toLocaleString("en-GB")} views`;
    case "post_lifecycle":
      return LIFECYCLE_SENTENCE[n.data?.stage ?? ""] ?? "There is news about your post";
  }
}

export function notificationHref(n: NotificationRow): string {
  switch (n.kind) {
    case "follow":
    case "friend":
      return n.actors[0]?.username ? `/u/${n.actors[0].username}` : "/profile";
    case "post_milestone":
    case "post_lifecycle":
      return n.post_id ? `/community/${n.post_id}/insights` : "/notifications";
    default:
      return n.post_id ? `/community/${n.post_id}` : "/notifications";
  }
}
