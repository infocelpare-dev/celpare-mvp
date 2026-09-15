import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/admin-shell";
import { requireAdmin } from "@/lib/admin/guard";

export const metadata: Metadata = {
  title: "Admin | Celpare",
  /* Nothing under /admin is ever indexed or followed. It is all behind a login
     already, but a stray link in a shared screenshot should not become a
     crawlable URL. */
  robots: { index: false, follow: false },
};

/*
  Every page under /admin passes through here first.

  requireAdmin() with no capability means admin.access: is this a staff account
  that is still active. The individual pages then ask for the capability they
  need, and every RPC they call asks a third time in SQL.

  Three checks for one page sounds redundant and is not. The layout stops a
  non admin at the door, the page stops a support account wandering into
  billing, and the database stops both regardless of what the browser was told.
  Only the third one is load bearing; the first two exist so that being refused
  looks like a product rather than a stack trace.
*/
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdmin();
  return <AdminShell session={session}>{children}</AdminShell>;
}
