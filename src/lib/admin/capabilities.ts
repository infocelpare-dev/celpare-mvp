/*
  The capability matrix, mirrored from SQL.

  THE RULE, and it is the same one Developer Mode runs on:

    This file decides what to RENDER. It grants nothing.

    public.admin_capabilities is the authorization. Every admin RPC calls
    admin_require(), which reads that table and raises 42501 when the capability
    is missing. Nothing in here is consulted by the database, so editing this
    file, or forging a role in a cookie, changes which links are drawn and
    changes nothing about what the server will do.

  Kept in sync by hand, deliberately. Generating it from the database at build
  time would make the browser bundle depend on a live connection, and a stale
  copy here is a cosmetic bug: a menu item that leads to a page that refuses.
  A stale copy in the other direction, SQL missing a capability the UI shows,
  is also a refusal rather than a leak. Both failure modes are closed.
*/

export const CAPABILITIES = [
  "admin.access",
  "users.read",
  "users.moderate",
  "users.plan",
  "users.role",
  "content.moderate",
  "reports.read",
  "submissions.review",
  "developers.manage",
  "models.manage",
  "ai.read",
  "ai.configure",
  "analytics.read",
  "billing.read",
  "security.read",
  "audit.read",
  "settings.manage",
  "jobs.read",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

export type StaffRole =
  | "support"
  | "moderator"
  | "dev_ops"
  | "ai_ops"
  | "admin"
  | "super_admin";

export const STAFF_ROLES: StaffRole[] = [
  "support",
  "moderator",
  "dev_ops",
  "ai_ops",
  "admin",
  "super_admin",
];

/* Every role a profile may hold, staff and not. Used by the role picker. */
export const ALL_ROLES = ["user", ...STAFF_ROLES] as const;
export type Role = (typeof ALL_ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  user: "User",
  support: "Support",
  moderator: "Moderator",
  dev_ops: "Developer ops",
  ai_ops: "AI ops",
  admin: "Admin",
  super_admin: "Super admin",
};

export const ROLE_DESCRIPTION: Record<Role, string> = {
  user: "No administrative access.",
  support: "Reads users and the reports queue. Changes nothing.",
  moderator: "The community, its reports, and the user level consequences.",
  dev_ops: "Submissions, developers, tools and models.",
  ai_ops: "AI spend, gateway visibility and background jobs. No configuration.",
  admin: "Everything except changing roles and reconfiguring the gateway.",
  super_admin: "Full access, including roles and AI configuration.",
};

export const MATRIX: Record<StaffRole, Capability[]> = {
  support: ["admin.access", "users.read", "reports.read", "analytics.read"],

  moderator: [
    "admin.access",
    "users.read",
    "users.moderate",
    "content.moderate",
    "reports.read",
    "analytics.read",
  ],

  dev_ops: [
    "admin.access",
    "submissions.review",
    "developers.manage",
    "models.manage",
    "reports.read",
    "analytics.read",
  ],

  ai_ops: ["admin.access", "ai.read", "jobs.read", "analytics.read"],

  admin: [
    "admin.access",
    "users.read",
    "users.moderate",
    "users.plan",
    "content.moderate",
    "reports.read",
    "submissions.review",
    "developers.manage",
    "models.manage",
    "ai.read",
    "analytics.read",
    "billing.read",
    "security.read",
    "audit.read",
    "settings.manage",
    "jobs.read",
  ],

  super_admin: [
    "admin.access",
    "users.read",
    "users.moderate",
    "users.plan",
    "users.role",
    "content.moderate",
    "reports.read",
    "submissions.review",
    "developers.manage",
    "models.manage",
    "ai.read",
    "ai.configure",
    "analytics.read",
    "billing.read",
    "security.read",
    "audit.read",
    "settings.manage",
    "jobs.read",
  ],
};

export function isStaffRole(role: string | null | undefined): role is StaffRole {
  return Boolean(role) && (STAFF_ROLES as string[]).includes(role as string);
}

export function capabilitiesFor(role: string | null | undefined): Capability[] {
  return isStaffRole(role) ? MATRIX[role] : [];
}

/* Privilege order, mirroring public.admin_rank. Used to grey out an action the
   server would refuse, never to permit one. */
export const RANK: Record<Role, number> = {
  user: 0,
  support: 1,
  moderator: 2,
  dev_ops: 2,
  ai_ops: 2,
  admin: 3,
  super_admin: 4,
};
