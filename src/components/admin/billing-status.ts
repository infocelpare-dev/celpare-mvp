import type { Tone } from "@/components/admin/ui";
import type { DisplayStatus } from "@/lib/billing/catalog";

/* Badge tone per billing status (phase BILL), shared by the queue and the
   request page. Waiting on us is warn; done is ok; refused is danger. */
export const BILLING_STATUS_TONE: Record<DisplayStatus, Tone> = {
  Pending: "warn",
  "Awaiting Payment": "neutral",
  "Partly Paid": "warn",
  "Not Paid": "neutral",
  "Under Review": "warn",
  "Invoice Sent": "neutral",
  Paid: "neutral",
  Active: "ok",
  Rejected: "danger",
  Expired: "neutral",
};
