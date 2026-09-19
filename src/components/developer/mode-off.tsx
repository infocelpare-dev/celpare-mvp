import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { AppShell } from "@/components/app/app-shell";
import { AccountNotices } from "@/components/app/account-notices";
import { AdminLink } from "@/components/app/admin-link";
import { Card } from "@/components/ui/card";

/*
  Developer Mode is off, so the workspace is not shown.

  This is a signpost, not a barrier. The security boundary is in the database:
  the write policies gate on developer_profiles.accepted_terms_at and never on
  the flag, so somebody who reached this URL with the flag forced on would still
  be unable to submit anything. All this page decides is what to render.

  Not a 404 either. Pretending the page does not exist to somebody who has an
  account and could switch it on in two clicks is unhelpful.
*/
export function ModeOff() {
  return (
    <AppShell banner={<AccountNotices />} adminLink={<AdminLink />}
      signedIn
    >
      <Container className="max-w-[640px] py-10 sm:py-14">
        <h1 className="font-display text-[clamp(1.6rem,4vw,2.1rem)] font-semibold leading-tight">
          Developer Mode is off
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted">
          Turn it on to submit AI tools and models to the Celpare catalogue and
          to manage them. You stay an ordinary Celpare account either way: it is
          a switch, not a different kind of signup.
        </p>

        <Card className="mt-8">
          <h2 className="font-display text-[17px] font-semibold">
            What turning it on gives you
          </h2>
          <ul className="mt-3 space-y-2 text-[14px] leading-relaxed text-muted">
            {[
              "A developer dashboard, with the real status of everything you submitted",
              "My Tools and My Models",
              "Tool and model submission, reviewed by Celpare before publishing",
              "A public developer profile",
            ].map((item) => (
              <li key={item} className="flex gap-2.5">
                <span aria-hidden className="mt-[7px] size-1.5 shrink-0 rounded-full bg-accent" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[13px] leading-relaxed text-muted">
            It does not change your role, your plan or your permissions, and it
            never lets you approve your own submissions.
          </p>
        </Card>

        <div className="mt-6 flex flex-wrap gap-3">
          <ButtonLink href="/profile">Turn it on from your profile</ButtonLink>
          <ButtonLink href="/community" variant="outline">
            Back to the feed
          </ButtonLink>
        </div>
      </Container>
    </AppShell>
  );
}
