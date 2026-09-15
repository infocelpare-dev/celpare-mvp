/*
  Shapes the admin RPCs return. Hand written rather than generated, so the
  jsonb documents that admin_overview and friends build have a name on this side
  instead of being read as `any` at every call site.
*/

export type Counts = Record<string, number>;

export type Overview = {
  users: Counts;
  developers: Counts;
  tools: Counts;
  community: Counts;
  ai: Counts;
  platform: Counts;
  generated_at: string;
};

export type AdminUserRow = {
  id: string;
  username: string | null;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
  role: string;
  plan: string;
  account_status: string;
  is_developer: boolean;
  email_confirmed: boolean;
  created_at: string;
  last_sign_in_at: string | null;
  post_count: number;
  comment_count: number;
  tool_count: number;
  reports_against: number;
  total_count: number;
};

export type AdminUserDetail = {
  account: {
    id: string;
    username: string | null;
    full_name: string | null;
    email: string;
    avatar_url: string | null;
    bio: string | null;
    location: string | null;
    website_url: string | null;
    role: string;
    plan: string;
    account_status: string;
    status_reason: string | null;
    suspended_until: string | null;
    is_developer: boolean;
    created_at: string;
    onboarded_at: string | null;
    email_confirmed_at: string | null;
    last_sign_in_at: string | null;
    providers: string[];
    follower_count: number;
    following_count: number;
  };
  activity: Counts;
  moderation: Counts;
  developer: {
    handle: string;
    verified: boolean;
    accepted_terms_at: string | null;
    terms_version: string | null;
    company: string | null;
    website_url: string | null;
    created_at: string;
  } | null;
  ai?: {
    requests: number;
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    cost_usd: number;
    failed: number;
    by_model: { model: string; provider: string; requests: number; tokens: number; cost_usd: number }[];
    by_day: { day: string; requests: number; tokens: number; cost_usd: number }[];
  };
  history?: {
    id: string;
    action: string;
    entity_type: string;
    reason: string | null;
    created_at: string;
    actor: string | null;
  }[];
};

export type AiAnalytics = {
  window_days: number;
  totals: Counts;
  latency: Counts;
  by_day: { day: string; requests: number; ok: number; failed: number; input_tokens: number; output_tokens: number; cost_usd: number }[];
  by_model: { model: string; provider: string; requests: number; input_tokens: number; output_tokens: number; cost_usd: number; failed: number; avg_latency: number }[];
  by_plan: { plan: string; requests: number; total_tokens: number; cost_usd: number }[];
  by_feature: { feature: string; requests: number; total_tokens: number }[];
  top_users: { user_id: string; username: string | null; plan: string; requests: number; total_tokens: number; cost_usd: number }[];
  anonymous_requests: number;
};

export type SearchAnalytics = {
  window_days: number;
  totals: Counts;
  tool_views: Counts;
  by_day: { day: string; searches: number; zero_result: number }[];
  popular: { query: string; searches: number; avg_results: number }[];
  zero_result: { query: string; searches: number }[];
  top_tools: { tool_id: string; slug: string; name: string; views: number; from_search: number }[];
};

export type RecommendationAnalytics = {
  window_days: number;
  totals: Counts;
  by_source: { candidate_source: string; impressions: number; clicks: number; saves: number }[];
  by_surface: { surface: string; impressions: number; clicks: number }[];
  top_tools: { slug: string; name: string; impressions: number; clicks: number; saves: number }[];
};

export type CommunityAnalytics = {
  window_days: number;
  by_day: {
    day: string;
    posts: number;
    comments: number;
    likes: number;
    reposts: number;
    saves: number;
    signups: number;
    active_users: number;
  }[];
  by_topic: { slug: string; name: string; posts: number; comments: number; likes: number }[];
  top_creators: { username: string | null; user_id: string; posts: number; likes: number; comments: number }[];
};

export type AuditRow = {
  id: string;
  actor_id: string | null;
  actor_username: string | null;
  actor_role: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_label: string | null;
  reason: string | null;
  before_state: Record<string, unknown>;
  after_state: Record<string, unknown>;
  ip: string | null;
  created_at: string;
  total_count: number;
};

export type GlobalHit = {
  kind: string;
  id: string;
  label: string;
  sublabel: string | null;
  status: string | null;
  href: string;
};

export type AdminToolRow = {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  logo_url: string | null;
  status: string;
  verified: boolean;
  source: string;
  pricing_model: string | null;
  rating: number | null;
  rating_count: number;
  popularity_score: number;
  developer_id: string | null;
  submitted_at: string;
  created_at: string;
  published_at: string | null;
};

export type AdminModelRow = {
  id: string;
  slug: string;
  name: string;
  provider: string;
  status: string;
  context_window: number | null;
  input_price_per_m: number | null;
  output_price_per_m: number | null;
  modalities: string[];
  developer_id: string | null;
  submitted_at: string;
  created_at: string;
};

export type AdminReportRow = {
  id: string;
  entity_type: string;
  entity_id: string;
  reason: string;
  note: string | null;
  status: string;
  priority: string;
  source: string;
  qualified: boolean;
  reporter_id: string;
  assigned_to: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  created_at: string;
};

export type AdminPostRow = {
  id: string;
  author_id: string;
  body: string;
  link_url: string | null;
  status: string;
  like_count: number;
  comment_count: number;
  report_count: number;
  qualified_report_count: number;
  created_at: string;
  deleted_at: string | null;
};

export type AdminCommentRow = {
  id: string;
  post_id: string;
  author_id: string;
  body: string;
  status: string;
  like_count: number;
  report_count: number;
  created_at: string;
  deleted_at: string | null;
};

export type SecurityEventRow = {
  id: string;
  kind: string;
  severity: string;
  user_id: string | null;
  subject: string | null;
  ip: string | null;
  detail: Record<string, unknown>;
  created_at: string;
};

export type JobRunRow = {
  id: string;
  job: string;
  status: string;
  attempt: number;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  error: string | null;
};

export type SettingRow = {
  key: string;
  category: string;
  value: unknown;
  description: string | null;
  updated_at: string;
  scope: "platform" | "community";
};

export type TaxonomyRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  sort_order: number;
  created_at: string;
  /* Tools in this category, or posts carrying this topic. Decides whether the
     slug is safe to rename and whether the entry can be deleted at all. */
  uses: number;
};

export type ThreadAuthor = {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  account_status: string;
};

export type ThreadReport = {
  id: string;
  entity_type: string;
  entity_id: string;
  reason: string;
  note: string | null;
  status: string;
  priority: string;
  qualified: boolean;
  created_at: string;
};

/* What admin_post_thread returns. Reporter identities are deliberately absent:
   deciding whether something breaks a rule does not need to know who objected,
   and the reports centre is where that belongs. */
export type PostThread = {
  post: AdminPostRow & { author: ThreadAuthor; topic: string | null; save_count: number; repost_count: number };
  comments: (AdminCommentRow & { author: ThreadAuthor })[];
  reports: ThreadReport[];
};

export type StorageUsage = {
  buckets: {
    name: string;
    public: boolean;
    size_limit: number | null;
    objects: number;
    bytes: number;
  }[];
  total_objects: number;
  total_bytes: number;
};
