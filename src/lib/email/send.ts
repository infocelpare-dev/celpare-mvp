import "server-only";
import { bump } from "@/lib/ai/ratelimit";
import type { BuiltEmail, EmailKind } from "./messages";

/*
  The app's own sender (D191). Resend's REST API with a plain fetch: no SDK, no
  new dependency. Auth codes do NOT come through here; Supabase sends those over
  Resend SMTP (D187), so a busy day for app email can never starve a login.

  Budget. Resend's free plan is 100 a day, shared by auth codes, the founder's
  Gmail and this. App email stops at 60 a day in total, with a smaller cap per
  kind, so one noisy kind (reports, follows) cannot eat the rest. Over budget,
  or when the budget cannot be checked, the email is skipped with a log line:
  every one of these is a courtesy, and the thing it announces is in the app.

  Never throws. Callers run it inside after(), so nobody waits on mail.
*/

/*
  Which address each kind comes from (D191, the founder's split):
  - noreplyaccount@: everything about the account itself. Supabase sends the
    codes, reset links and change notices from it too (SMTP sender).
  - submission@: the developer side. Receives replies, and the founder also
    writes from it in Gmail.
  - noreply@: community mail. Reports go TO reports@, which only receives.
*/
const SENDER: Record<EmailKind, { from: string; replyTo: string }> = {
  welcome: { from: "Celpare <noreplyaccount@celpare.com>", replyTo: "info@celpare.com" },
  new_login: { from: "Celpare <noreplyaccount@celpare.com>", replyTo: "info@celpare.com" },
  tool_submitted: { from: "Celpare Submissions <submission@celpare.com>", replyTo: "submission@celpare.com" },
  tool_decision: { from: "Celpare Submissions <submission@celpare.com>", replyTo: "submission@celpare.com" },
  developer_verified: { from: "Celpare Submissions <submission@celpare.com>", replyTo: "submission@celpare.com" },
  report: { from: "Celpare <noreply@celpare.com>", replyTo: "info@celpare.com" },
  new_follower: { from: "Celpare <noreply@celpare.com>", replyTo: "info@celpare.com" },
};

export const REPORTS_INBOX = process.env.REPORTS_INBOX || "reports@celpare.com";

const APP_DAILY_CAP = 60;
const KIND_DAILY_CAP: Record<EmailKind, number> = {
  report: 25,
  welcome: 30,
  tool_submitted: 20,
  tool_decision: 20,
  developer_verified: 10,
  new_follower: 30,
  new_login: 30,
};

let warned = false;

export type SendResult = "sent" | "skipped" | "failed";

export async function sendEmail(to: string, email: BuiltEmail): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    if (!warned) {
      console.warn("[email] RESEND_API_KEY is not set, so app emails are not sent.");
      warned = true;
    }
    return "skipped";
  }

  const day = new Date().toISOString().slice(0, 10);
  try {
    const [all, ofKind] = await Promise.all([
      bump(`email:app:${day}`, 1, 2 * 86400),
      bump(`email:${email.kind}:${day}`, 1, 2 * 86400),
    ]);
    if (all > APP_DAILY_CAP || ofKind > KIND_DAILY_CAP[email.kind]) {
      console.warn("[email] daily budget reached, skipped", email.kind);
      return "skipped";
    }
  } catch (err) {
    console.error("[email] budget unavailable, skipped", email.kind, err);
    return "skipped";
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: SENDER[email.kind].from,
        to: [to],
        reply_to: SENDER[email.kind].replyTo,
        subject: email.subject,
        html: email.html,
        text: email.text,
        tags: [{ name: "kind", value: email.kind }],
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      /* The address is not logged: the kind and status are enough to debug. */
      console.error("[email] Resend refused", email.kind, res.status, (await res.text()).slice(0, 300));
      return "failed";
    }
    return "sent";
  } catch (err) {
    console.error("[email] send failed", email.kind, err);
    return "failed";
  }
}
