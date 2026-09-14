import { ButtonLink } from "@/components/ui/button";

/*
  A section that is coming, said plainly.

  Not a disabled form and not a fake one. A form that looks ready and refuses
  to submit is worse than no form: it costs somebody the time to fill it in
  before telling them. This says what is coming, when, and what to do now.

  Same reasoning as defect F4, which was nav items leading nowhere: the answer
  there was pages that name themselves and say which phase fills them.
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
    <div className="rounded-2xl border border-border px-6 py-14 text-center">
      <p className="font-display text-[19px] font-semibold">{what}</p>
      <p className="mx-auto mt-3 max-w-[48ch] text-[15px] leading-relaxed text-muted">
        {detail}
      </p>
      <div className="mt-6">
        <ButtonLink href={backHref} variant="outline" size="sm">
          {backLabel}
        </ButtonLink>
      </div>
    </div>
  );
}
