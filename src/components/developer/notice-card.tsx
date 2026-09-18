import { ButtonLink } from "@/components/ui/button";

/*
  A centred card that says why a page has nothing to do on it, and where to go
  instead. Two things use it: a section that is coming, and a section an
  administrator has switched off.

  Flat, one hairline border, no shadow, per D11.
*/
export function NoticeCard({
  title,
  detail,
  backHref,
  backLabel,
}: {
  title: string;
  detail: string;
  backHref: string;
  backLabel: string;
}) {
  return (
    <div className="rounded-2xl border border-border px-6 py-14 text-center">
      <p className="font-display text-[19px] font-semibold">{title}</p>
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
