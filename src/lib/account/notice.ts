import { createClient, getCurrentUser, isSupabaseConfigured } from "@/lib/supabase/server";
import { getAnnouncement } from "@/lib/platform/settings";

/*
  What the person at the keyboard needs to be told before they try to do
  something the platform will refuse.

  Phase 4Q.1 made suspension enforce itself in the database, which without this
  file would mean a suspended person clicks post and gets a generic failure with
  no explanation anywhere. A consequence nobody explains is indistinguishable
  from a bug.

  Two sources, one strip: the account's own state, and the platform
  announcement an administrator set in /admin/settings.
*/

export type Notice = {
  tone: "danger" | "warn" | "info";
  title: string;
  body: string;
  /* Suspension only. Rendered as an absolute date, because "in 3 days" is
     ambiguous about when it actually lifts. */
  until?: string;
};

type StatusRow = {
  account_status: string;
  status_reason: string | null;
  suspended_until: string | null;
};

/*
  A suspension whose end date has passed is over. This mirrors
  public.is_active_account() exactly, and the two must stay in step: if this
  said "suspended" while the database let the write through, the person would be
  told they cannot do a thing they can do.
*/
export function suspensionIsOver(row: StatusRow): boolean {
  if (row.account_status !== "suspended") return false;
  if (!row.suspended_until) return false;
  return new Date(row.suspended_until).getTime() <= Date.now();
}

function accountNotice(row: StatusRow): Notice | null {
  if (row.account_status === "active" || suspensionIsOver(row)) return null;

  const reason = row.status_reason?.trim();

  if (row.account_status === "suspended") {
    return {
      tone: "danger",
      title: row.suspended_until ? "Your account is suspended" : "Your account is suspended indefinitely",
      body: reason
        ? `Reason given: ${reason}. You can still read Celpare and your own work is untouched. Posting, commenting, following and submitting are paused.`
        : "You can still read Celpare and your own work is untouched. Posting, commenting, following and submitting are paused.",
      until: row.suspended_until ?? undefined,
    };
  }

  if (row.account_status === "disabled") {
    return {
      tone: "danger",
      title: "Your account is disabled",
      body: reason
        ? `Reason given: ${reason}. Contact support if you think this is wrong.`
        : "Contact support if you think this is wrong.",
    };
  }

  /* 'deleted' is a state an administrator sets, not the person. Saying so
     plainly is better than a dead interface that refuses everything. */
  return {
    tone: "danger",
    title: "This account is closed",
    body: reason ? `Reason given: ${reason}.` : "Contact support if you think this is wrong.",
  };
}

export async function getNotices(): Promise<Notice[]> {
  const notices: Notice[] = [];

  const announcement = await getAnnouncement();
  if (announcement) {
    notices.push({ tone: "info", title: "Celpare", body: announcement.message });
  }

  if (!isSupabaseConfigured()) return notices;

  const user = await getCurrentUser();
  if (!user) return notices;
  const supabase = await createClient();

  const { data } = await supabase
    .from("profiles")
    .select("account_status, status_reason, suspended_until")
    .eq("id", user.id)
    .maybeSingle();

  if (data) {
    const notice = accountNotice(data as StatusRow);
    /* The account's own state leads. An announcement about a release matters
       less than being told you cannot post. */
    if (notice) notices.unshift(notice);
  }

  return notices;
}
