import { AlertTriangle, Info } from "lucide-react";
import type { Notice } from "@/lib/account/notice";

/*
  The strip above the page: suspension, and the platform announcement.

  role="status" rather than role="alert". Both are rendered on arrival rather
  than in response to an action, and alert interrupts a screen reader mid
  sentence, which is right for something that just went wrong and wrong for a
  standing condition. aria-atomic so the whole notice is read as one message
  instead of a fragment.

  Flat, one hairline border, no shadow, per D11. Tone comes from the semantic
  surface tokens, which are defined for both themes, so none of this needs a
  dark mode branch.
*/

const TONE = {
  danger: {
    wrap: "border-danger/30 bg-danger-surface text-danger-text",
    icon: AlertTriangle,
  },
  warn: {
    wrap: "border-warn/30 bg-warn-surface text-warn-text",
    icon: AlertTriangle,
  },
  info: {
    wrap: "border-border bg-surface text-foreground",
    icon: Info,
  },
} as const;

/*
  UTC, explicitly. This renders on the server and hydrates on the client, and
  without a fixed `timeZone` the two format in whatever zone each is in, which
  is a hydration mismatch. The same mistake in the admin dashboard's When
  component produced a real React hydration error on /admin/security.

  UTC rather than the viewer's zone is a real trade here: a suspension end date
  is something the person reads about themselves, so their own timezone would be
  friendlier. It is stated rather than implied, so it cannot be misread, and
  showing the wrong hour for three hours would be worse than showing a labelled
  one. Local time needs a client component, which this deliberately is not.
*/
function formatUntil(iso: string) {
  return `${new Date(iso).toLocaleString("en-GB", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "UTC",
  })} UTC`;
}

export function NoticeBar({ notices }: { notices: Notice[] }) {
  if (notices.length === 0) return null;

  return (
    <div role="status" aria-atomic="true" className="shrink-0 border-b border-border">
      {notices.map((notice, i) => {
        const tone = TONE[notice.tone];
        const Icon = tone.icon;

        return (
          <div
            key={`${notice.tone}-${i}`}
            className={`flex items-start gap-3 border-b px-3 py-2.5 last:border-b-0 sm:px-4 ${tone.wrap}`}
          >
            <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p className="min-w-0 text-[13px] leading-relaxed">
              <span className="font-medium">{notice.title}.</span>{" "}
              <span className="opacity-90">{notice.body}</span>
              {notice.until ? (
                <>
                  {" "}
                  <span className="opacity-90">
                    It lifts on <time dateTime={notice.until}>{formatUntil(notice.until)}</time>.
                  </span>
                </>
              ) : null}
            </p>
          </div>
        );
      })}
    </div>
  );
}
