/*
  What Download my data returns (phase LEGAL, 2026-10-07). One entry per table,
  each read with an explicit filter on the requesting user's id, so the file can
  only ever hold rows that belong to, or were addressed to, that person.

  `select` is "*" unless a column must stay out: model and provider in Ask
  Celpare records, because what runs Ask Celpare is not disclosed (D64).
*/

export type ExportTable = {
  /* Key in the downloaded file. */
  key: string;
  table: string;
  /* Column that holds the user's id. */
  column: string;
  /* "viewer" columns hold the text key `u:<user id>` (post_viewers, D129). */
  match?: "id" | "viewer";
  select: string;
};

export const EXPORT_TABLES: ExportTable[] = [
  { key: "profile", table: "profiles", column: "id", select: "*" },
  { key: "onboarding_answers", table: "user_onboarding", column: "user_id", select: "*" },
  { key: "developer_profile", table: "developer_profiles", column: "id", select: "*" },
  { key: "posts", table: "posts", column: "author_id", select: "*" },
  { key: "comments", table: "comments", column: "author_id", select: "*" },
  { key: "likes", table: "likes", column: "user_id", select: "*" },
  { key: "reposts", table: "reposts", column: "user_id", select: "*" },
  { key: "saves", table: "saves", column: "user_id", select: "*" },
  { key: "following", table: "follows", column: "follower_id", select: "*" },
  { key: "followers", table: "follows", column: "following_id", select: "*" },
  { key: "mentions_of_you", table: "post_mentions", column: "user_id", select: "*" },
  { key: "posts_you_viewed", table: "post_viewers", column: "viewer", match: "viewer", select: "*" },
  { key: "feed_feedback", table: "feed_feedback", column: "user_id", select: "*" },
  { key: "comment_events", table: "comment_events", column: "user_id", select: "post_id, comment_id, event, mode, position, depth, algorithm, reason, created_at" },
  { key: "ask_conversations", table: "conversations", column: "user_id", select: "*" },
  {
    key: "ask_usage",
    table: "ai_usage_records",
    column: "user_id",
    select:
      "id,plan,feature,input_tokens,output_tokens,status,created_at,tool_search,web_search,deep_research,search_calls",
  },
  { key: "collections", table: "user_collections", column: "user_id", select: "*" },
  { key: "saved_tools", table: "user_saved_tools", column: "user_id", select: "*" },
  { key: "saved_models", table: "user_saved_models", column: "user_id", select: "*" },
  { key: "favorite_tools", table: "profile_favorite_tools", column: "profile_id", select: "*" },
  { key: "favorite_models", table: "profile_favorite_models", column: "profile_id", select: "*" },
  { key: "featured_tools", table: "profile_featured_tools", column: "profile_id", select: "*" },
  { key: "tool_reviews", table: "tool_reviews", column: "user_id", select: "*" },
  { key: "tool_reactions", table: "tool_reactions", column: "user_id", select: "*" },
  { key: "notifications", table: "notifications", column: "recipient_id", select: "*" },
  { key: "notification_preferences", table: "notification_preferences", column: "user_id", select: "*" },
  { key: "reports_you_made", table: "reports", column: "reporter_id", select: "*" },
  { key: "searches", table: "search_events", column: "user_id", select: "*" },
  { key: "tools_you_viewed", table: "tool_view_events", column: "user_id", select: "*" },
  { key: "models_you_viewed", table: "model_view_events", column: "user_id", select: "*" },
  { key: "compare_events", table: "compare_events", column: "user_id", select: "*" },
  { key: "known_devices", table: "known_devices", column: "user_id", select: "*" },
  { key: "tools_you_listed", table: "tools", column: "developer_id", select: "*" },
  { key: "models_you_listed", table: "models", column: "developer_id", select: "*" },
  { key: "tool_sponsorships", table: "tool_sponsorships", column: "developer_id", select: "*" },
  { key: "verification_requests", table: "tool_verification_requests", column: "developer_id", select: "*" },
  { key: "message_threads", table: "dm_participants", column: "user_id", select: "*" },
];

/* Columns that must never appear in an export (D64). */
export const FORBIDDEN_COLUMNS = ["model", "provider"] as const;

/* Ask messages are read by conversation id, without model and provider. */
export const ASK_MESSAGE_SELECT = "id,conversation_id,role,content,citations,created_at";

/* Direct messages are read by thread id: the ones you sent and received. */
export const DM_MESSAGE_SELECT =
  "id,thread_id,sender_id,kind,body,link_url,media_path,duration_seconds,file_name,file_size,created_at,deleted_at";

export function matchValue(t: ExportTable, userId: string): string {
  return t.match === "viewer" ? `u:${userId}` : userId;
}
