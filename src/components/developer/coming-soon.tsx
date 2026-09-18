import { NoticeCard } from "@/components/developer/notice-card";

/*
  A section that is coming, said plainly.

  Not a disabled form and not a fake one. A form that looks ready and refuses
  to submit is worse than no form: it costs somebody the time to fill it in
  before telling them. This says what is coming, when, and what to do now.

  Same reasoning as defect F4, which was nav items leading nowhere: the answer
  there was pages that name themselves and say which phase fills them.

  The card itself lives in notice-card.tsx, because a paused section needs the
  same card and is not the same thing as an unbuilt one.
*/
export function ComingSoon({
  what,
  detail,
  backHref,
  backLabel,
}: {
  what: string;
  detail: string;
  backHref: string;
  backLabel: string;
}) {
  return (
    <NoticeCard
      title={what}
      detail={detail}
      backHref={backHref}
      backLabel={backLabel}
    />
  );
}
