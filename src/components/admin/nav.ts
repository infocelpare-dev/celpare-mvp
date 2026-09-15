import type { Capability } from "@/lib/admin/capabilities";

/*
  The dashboard's map.

  Grouped rather than one list of twenty, because twenty destinations in a
  flat column is a menu nobody reads: the eye has nothing to bind against and
  every visit becomes a linear scan. Five groups of three or four is scannable.

  Each item names the capability that owns it. The nav then renders only what
  the role can reach, so a moderator sees a six item sidebar rather than an
  twenty item one with fourteen dead ends. This is presentation: the page itself
  calls requireAdmin() with the same capability, and every RPC checks it again
  in SQL. Hiding a link is a courtesy, never a control.
*/

export type AdminNavItem = {
  href: string;
  label: string;
  capability: Capability;
  /* Matched exactly rather than by prefix, for the one item whose href is a
     prefix of every other. */
  exact?: boolean;
};

export type AdminNavGroup = {
  label: string;
  items: AdminNavItem[];
};

export const ADMIN_NAV: AdminNavGroup[] = [
  {
    label: "Overview",
    items: [{ href: "/admin", label: "Dashboard", capability: "admin.access", exact: true }],
  },
  {
    label: "People",
    items: [
      { href: "/admin/users", label: "Users", capability: "users.read" },
      { href: "/admin/developers", label: "Developers", capability: "developers.manage" },
    ],
  },
  {
    label: "Catalogue",
    items: [
      { href: "/admin/submissions", label: "Submissions", capability: "submissions.review" },
      { href: "/admin/tools", label: "Tools", capability: "submissions.review" },
      { href: "/admin/models", label: "Models", capability: "models.manage" },
    ],
  },
  {
    label: "Moderation",
    items: [
      { href: "/admin/community", label: "Community", capability: "content.moderate" },
      { href: "/admin/reports", label: "Reports", capability: "reports.read" },
    ],
  },
  {
    label: "Insight",
    items: [
      { href: "/admin/ai", label: "AI operations", capability: "ai.read" },
      { href: "/admin/gateway", label: "AI gateway", capability: "ai.read" },
      { href: "/admin/analytics", label: "Community analytics", capability: "analytics.read" },
      { href: "/admin/search", label: "Search", capability: "analytics.read" },
      { href: "/admin/recommendations", label: "Recommendations", capability: "analytics.read" },
      { href: "/admin/billing", label: "Plans and billing", capability: "billing.read" },
    ],
  },
  {
    label: "Platform",
    items: [
      { href: "/admin/security", label: "Security", capability: "security.read" },
      { href: "/admin/sentry", label: "Errors and performance", capability: "security.read" },
      { href: "/admin/audit", label: "Audit log", capability: "audit.read" },
      { href: "/admin/health", label: "System health", capability: "admin.access" },
      { href: "/admin/jobs", label: "Background jobs", capability: "jobs.read" },
      { href: "/admin/taxonomy", label: "Categories and topics", capability: "settings.manage" },
      { href: "/admin/settings", label: "Settings", capability: "settings.manage" },
    ],
  },
];

export function visibleNav(capabilities: Capability[]): AdminNavGroup[] {
  return ADMIN_NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) => capabilities.includes(item.capability)),
  })).filter((group) => group.items.length > 0);
}
