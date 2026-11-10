import { renderEmail, siteUrl } from "./layout";

/*
  The emails the app sends itself (D191), as pure builders: data in, subject
  and bodies out. Who receives them, and whether they may, is decided in
  dispatch.ts. The Notion "Emails" page is the list these come from.
*/

export type EmailKind =
  | "report"
  | "welcome"
  | "tool_submitted"
  | "tool_decision"
  | "developer_verified"
  | "new_follower"
  | "new_login"
  | "account_deleted"
  | "demo"
  | "billing"
  | "billing_alert";

export type BuiltEmail = { kind: EmailKind; subject: string; html: string; text: string };

/* A subject is a header: no line breaks, and short enough to read. */
function subjectPart(s: string, max = 80): string {
  const flat = s.replace(/[\r\n\t]+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}...` : flat;
}

const REASON_LABEL: Record<string, string> = {
  spam: "Spam",
  abuse: "Abuse",
  harassment: "Harassment",
  offtopic: "Off topic",
  illegal: "Illegal content",
  security: "Security risk",
  other: "Other",
};

export type ReportInput = {
  entityType: "post" | "comment" | "tool";
  entityId: string;
  reason: string;
  note: string | null;
  /* Where the item can be seen, when there is a page for it. */
  itemPath: string | null;
  at: Date;
};

/* To reports@celpare.com. The reporter is never named here: the admin queue has
   that, behind a capability, and an inbox is not the place for it. */
export function reportEmail(r: ReportInput): BuiltEmail {
  const reason = REASON_LABEL[r.reason] ?? r.reason;
  const body = renderEmail({
    heading: `A ${r.entityType} was reported`,
    paragraphs: ["Someone reported this on Celpare. It is waiting in the admin queue."],
    details: [
      { label: "Reason", value: reason },
      { label: "Type", value: r.entityType },
      { label: "Id", value: r.entityId },
      { label: "When", value: `${r.at.toISOString().replace("T", " ").slice(0, 16)} UTC` },
      ...(r.itemPath ? [{ label: "Item", value: siteUrl(r.itemPath) }] : []),
      ...(r.note ? [{ label: "Note", value: r.note.slice(0, 500) }] : []),
    ],
    action: { label: "Open the report queue", href: siteUrl("/admin/reports") },
    footnote: "Sent to reports@celpare.com because a report was filed on Celpare.",
  });
  return { kind: "report", subject: `New report: ${reason} on a ${r.entityType}`, ...body };
}

export function welcomeEmail(name: string | null): BuiltEmail {
  const first = name?.trim().split(/\s+/)[0];
  const body = renderEmail({
    heading: first ? `Welcome to Celpare, ${first}` : "Welcome to Celpare",
    paragraphs: [
      "Celpare helps you find the right AI tool or model for what you want to get done.",
      "Search and explore tools and models, compare them side by side with the evidence, ask Celpare a question, and see what the community is using.",
    ],
    action: { label: "Start exploring", href: siteUrl("/explore") },
    footnote: "You are getting this because you just created a Celpare account.",
  });
  return { kind: "welcome", subject: "Welcome to Celpare", ...body };
}

/* Sent to the address the account had, after it is gone (phase LEGAL). */
export function accountDeletedEmail(name: string | null): BuiltEmail {
  const first = name?.trim().split(/\s+/)[0];
  const body = renderEmail({
    heading: first ? `Your Celpare account is deleted, ${first}` : "Your Celpare account is deleted",
    paragraphs: [
      "Your profile, posts, comments, messages, saved items, chats and uploaded files have been removed, as you asked.",
      "Search and view records you made are kept only without your name or account attached. Tools you listed as a developer stay in the catalogue without an owner.",
      "If you did not ask for this, reply to this email straight away.",
    ],
    action: { label: "Read the Privacy Policy", href: siteUrl("/legal/privacy") },
    footnote: "This is the last email Celpare sends to this address about the account.",
  });
  return { kind: "account_deleted", subject: "Your Celpare account is deleted", ...body };
}

export function toolSubmittedEmail(kind: "tool" | "model", name: string): BuiltEmail {
  const body = renderEmail({
    heading: "We received your submission",
    paragraphs: [
      `${name} is now in the review queue. A reviewer checks every ${kind} before it goes live.`,
      "You will get an email when there is a decision. You can follow it in your developer dashboard meanwhile.",
    ],
    action: { label: "Open your dashboard", href: siteUrl("/developer") },
  });
  return {
    kind: "tool_submitted",
    subject: `Submitted for review: ${subjectPart(name)}`,
    ...body,
  };
}

export type Decision = "approve" | "reject" | "request_changes" | "suspend" | "restore";

export function toolDecisionEmail(
  kind: "tool" | "model",
  name: string,
  decision: Decision,
  reason: string | null,
  livePath: string | null,
): BuiltEmail | null {
  const n = subjectPart(name);
  const why = reason ? [{ label: "Reviewer's note", value: reason.slice(0, 1000) }] : [];

  if (decision === "approve") {
    const body = renderEmail({
      heading: `${name} is live`,
      paragraphs: [`Your ${kind} was approved and is now published on Celpare.`],
      ...(livePath ? { action: { label: `View your ${kind}`, href: siteUrl(livePath) } } : {}),
    });
    return { kind: "tool_decision", subject: `Approved: ${n} is live on Celpare`, ...body };
  }
  if (decision === "request_changes") {
    const body = renderEmail({
      heading: `Changes requested for ${name}`,
      paragraphs: [
        `A reviewer looked at your ${kind} and needs a few changes before it can go live.`,
      ],
      details: why,
      action: { label: "Make the changes", href: siteUrl("/developer") },
    });
    return { kind: "tool_decision", subject: `Changes requested: ${n}`, ...body };
  }
  if (decision === "reject") {
    const body = renderEmail({
      heading: `${name} was not approved`,
      paragraphs: [`Your ${kind} was not approved for Celpare. The reviewer's note is below.`],
      details: why,
      action: { label: "Open your dashboard", href: siteUrl("/developer") },
      footnote: "Questions about this decision? Reply to this email.",
    });
    return { kind: "tool_decision", subject: `Not approved: ${n}`, ...body };
  }
  if (decision === "suspend") {
    const body = renderEmail({
      heading: `${name} was suspended`,
      paragraphs: [`Your ${kind} was taken off Celpare and returned to review.`],
      details: why,
      action: { label: "Open your dashboard", href: siteUrl("/developer") },
      footnote: "Questions about this decision? Reply to this email.",
    });
    return { kind: "tool_decision", subject: `Suspended: ${n}`, ...body };
  }
  /* Restore is an internal undo. The developer already has the email that
     mattered, so a second one would only confuse. */
  return null;
}

export function developerVerifiedEmail(name: string | null): BuiltEmail {
  const body = renderEmail({
    heading: "You are a verified Celpare developer",
    paragraphs: [
      `${name ? `${name}, your` : "Your"} developer profile now carries the verified badge on Celpare.`,
      "People see it next to your tools and models, so they know who stands behind them.",
    ],
    action: { label: "Open your dashboard", href: siteUrl("/developer") },
  });
  return { kind: "developer_verified", subject: "Your Celpare developer profile is verified", ...body };
}

export function newFollowerEmail(follower: { name: string | null; username: string | null }): BuiltEmail {
  const who = follower.name?.trim() || (follower.username ? `@${follower.username}` : "Someone");
  const body = renderEmail({
    heading: `${who} followed you`,
    paragraphs: [`${who} started following you on Celpare.`],
    ...(follower.username
      ? { action: { label: "See their profile", href: siteUrl(`/u/${follower.username}`) } }
      : {}),
    footnote: "Turn these emails off in Settings, Notifications.",
  });
  return { kind: "new_follower", subject: `${subjectPart(who, 60)} followed you on Celpare`, ...body };
}

export type LoginInput = { at: Date; browser: string; ip: string | null };

/* From noreplyaccount@. A browser this account has not logged in from before. */
export function newLoginEmail(l: LoginInput): BuiltEmail {
  const body = renderEmail({
    heading: "New login to your Celpare account",
    paragraphs: ["Your account was just logged in to from a browser we have not seen before."],
    details: [
      { label: "When", value: `${l.at.toISOString().replace("T", " ").slice(0, 16)} UTC` },
      { label: "Browser", value: l.browser },
      ...(l.ip ? [{ label: "Network", value: l.ip }] : []),
    ],
    action: { label: "Change your password", href: siteUrl("/settings") },
    footnote:
      "If this was you, there is nothing to do. If it was not, change your password now and write to reports@celpare.com.",
  });
  return { kind: "new_login", subject: "New login to your Celpare account", ...body };
}

/* "Chrome on Windows" from a user agent, without a parser dependency. */
export function describeBrowser(ua: string | null): string {
  if (!ua) return "Unknown browser";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : "A browser";
  const os = /Windows/.test(ua)
    ? "Windows"
    : /iPhone|iPad/.test(ua)
      ? "iOS"
      : /Android/.test(ua)
        ? "Android"
        : /Mac OS X/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "an unknown system";
  return `${browser} on ${os}`;
}

/* 203.0.113.42 to 203.0.113.x: enough to recognise a network, not a house. */
export function maskIp(ip: string | null): string | null {
  if (!ip) return null;
  const v4 = ip.match(/^(\d+\.\d+\.\d+)\.\d+$/);
  if (v4) return `${v4[1]}.x`;
  const parts = ip.split(":").filter(Boolean);
  return parts.length > 3 ? `${parts.slice(0, 3).join(":")}::x` : ip;
}

/*
  From demo@, to whoever asked for a demo on /demo or the landing page (D236).
  The demo is the product itself: three places to try, the docs, and a video
  when DEMO_VIDEO_URL is set (videos are never committed, so it is a link).
*/
export function demoEmail(videoUrl?: string | null): BuiltEmail {
  const video = videoUrl?.startsWith("https://") ? videoUrl : null;
  const body = renderEmail({
    heading: "See Celpare in action",
    paragraphs: [
      "Thanks for asking. Celpare helps you find, compare and choose the right AI tool or model for what you want to do. Right tool. Right result.",
      "Here is the quickest way to see it. Each one opens in your browser, no account needed to look around.",
    ],
    links: [
      ...(video ? [{ label: "Watch the demo", href: video, note: "A short walkthrough of Celpare from question to choice." }] : []),
      { label: "Ask Celpare", href: siteUrl("/ask"), note: "Describe what you want to do and get the tools that fit, with reasons." },
      { label: "Compare", href: siteUrl("/compare"), note: "Put tools and models side by side: pricing, features and benchmarks, with sources." },
      { label: "Explore", href: siteUrl("/explore"), note: "Browse what is new and rising across AI tools, models and the community." },
      { label: "Grow your startup with Celpare", href: siteUrl("/startups"), note: "Build with the right tools, or get your own AI tool discovered." },
      { label: "Help and docs", href: siteUrl("/help"), note: "How every part of Celpare works." },
    ],
    action: { label: "Create a free account", href: siteUrl("/get-started") },
    footnote: "You asked for a demo at celpare.com. Reply to this email with any question and we will answer.",
  });
  return { kind: "demo", subject: "Your Celpare demo", ...body };
}

/* ---------------------------------------------------------------- billing */
/*
  Phase CRYPTO (D256 to D262), replacing the Payoneer emails of phase BILL.
  Customer emails go to the account's own address, never to the billing email
  typed into the form, so the form cannot be used to send Celpare mail to a
  stranger. There is no automatic "request received" email: the person goes
  straight to the NOWPayments page, and hears from us when the plan is on. An
  admin can send a payment reminder (D262) for a checkout left unpaid; it links
  to the billing page on celpare.com, never straight to a payment page, so the
  rule in PAY_SAFELY stays true.
*/

export type BillingEmailInput = {
  plan: string;
  period: string;
  amount: string;
  invoiceNumber?: string;
  endsOn?: string;
};

const PAY_SAFELY =
  "Pay only on the NOWPayments page you reach from celpare.com. Celpare never asks for card details, wallet keys, seed phrases or payment screenshots by email or chat.";

export function billingActivatedEmail(b: BillingEmailInput): BuiltEmail {
  const body = renderEmail({
    heading: `${b.plan} is active`,
    paragraphs: [
      "Your payment is confirmed and your plan is switched on. Thank you for supporting Celpare.",
      b.endsOn
        ? `It runs until ${b.endsOn}. Nothing renews automatically: renew from your billing page before then.`
        : "Nothing renews automatically: renew from your billing page before it ends.",
    ],
    details: [
      { label: "Plan", value: b.plan },
      ...(b.invoiceNumber ? [{ label: "Celpare reference", value: b.invoiceNumber }] : []),
      ...(b.endsOn ? [{ label: "Active until", value: b.endsOn }] : []),
    ],
    action: { label: "Open Celpare", href: siteUrl("/app") },
    footnote: PAY_SAFELY,
  });
  return { kind: "billing", subject: `${subjectPart(b.plan)} is active`, ...body };
}

/* Sent by an admin from the request page (D262). */
export function billingPaymentLinkEmail(b: BillingEmailInput): BuiltEmail {
  const body = renderEmail({
    heading: `Finish paying for ${b.plan}`,
    paragraphs: [
      `Your checkout for ${b.plan} is ready and waiting. Open your billing page on Celpare and choose Continue to payment to pay ${b.amount} in BTC, ETH, BNB, XRP or USDT.`,
      "Your plan switches on by itself as soon as the payment is confirmed. If you no longer want it, ignore this email: nothing is charged.",
    ],
    details: [
      { label: "Plan", value: `${b.plan}, ${b.period}` },
      { label: "Price", value: b.amount },
      ...(b.invoiceNumber ? [{ label: "Celpare reference", value: b.invoiceNumber }] : []),
    ],
    action: { label: "Open your billing page", href: siteUrl("/settings/billing") },
    footnote: PAY_SAFELY,
  });
  return { kind: "billing", subject: `Finish paying for ${subjectPart(b.plan)}`, ...body };
}

export type BillingAlertEvent = "paid" | "partial" | "mismatch" | "refunded";

export type BillingAlertInput = BillingEmailInput & {
  event: BillingAlertEvent;
  billingName: string;
  billingEmail: string;
  country: string;
  requestId: string;
  paymentId?: string;
  paid?: string;
};

const ALERT: Record<BillingAlertEvent, { heading: string; line: string; subject: string }> = {
  paid: { heading: "Payment received", line: "A crypto payment finished and the plan was switched on automatically.", subject: "Paid" },
  partial: { heading: "Partly paid", line: "The customer sent less than the price. Nothing was switched on. Settle it with them, then reject the request with the reason.", subject: "Partly paid" },
  mismatch: { heading: "Payment does not match", line: "A finished payment did not match the request (currency or amount). Nothing was switched on. Check it in NOWPayments.", subject: "Check payment" },
  refunded: { heading: "Payment refunded", line: "NOWPayments reports this payment as refunded. If the plan is still on, end it from the admin page.", subject: "Refunded" },
};

/* To billing@ (D241). */
export function billingAlertEmail(a: BillingAlertInput): BuiltEmail {
  const e = ALERT[a.event];
  const body = renderEmail({
    heading: e.heading,
    paragraphs: [e.line],
    details: [
      { label: "Plan", value: `${a.plan}, ${a.period}` },
      { label: "Amount", value: a.amount },
      ...(a.paid ? [{ label: "Received", value: a.paid }] : []),
      ...(a.paymentId ? [{ label: "NOWPayments payment", value: a.paymentId }] : []),
      { label: "Name", value: a.billingName },
      { label: "Billing email", value: a.billingEmail },
      { label: "Country", value: a.country },
    ],
    action: { label: "Open the request", href: siteUrl(`/admin/billing/${a.requestId}`) },
  });
  return { kind: "billing_alert", subject: `${e.subject}: ${subjectPart(a.plan)} ${a.amount}`, ...body };
}
