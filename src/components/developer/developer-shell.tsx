import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { AppShell } from "@/components/app/app-shell";
import { DeveloperNav } from "@/components/developer/developer-nav";
import { Badge } from "@/components/ui/card";
import { BackLink } from "@/components/ui/back-link";
import { signOut } from "@/app/actions/auth";

/*
  One frame for every developer page: the ordinary Celpare shell, a heading,
  the developer nav, then the page. Keeping the normal sidebar means a
  developer is never more than one click from the feed or the assistant.
*/
export function DeveloperShell({
  title,
  lead,
  verified = false,
  action,
  backHref = "/profile",
  backLabel = "Back to your profile",
  children,
}: {
  title: string;
  lead?: string;
  verified?: boolean;
  action?: React.ReactNode;
  /* Every developer page names where it goes back to. Defaults to the profile,
     because that is where Developer Mode is switched on and the workspace is
     entered from. */
  backHref?: string;
  backLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <AppShell
      signedIn
      signOutAction={
        <form action={signOut}>
          <Button variant="outline" size="sm" type="submit">
            Log out
          </Button>
        </form>
      }
    >
      <Container className="max-w-[880px] py-10 sm:py-14">
        <BackLink href={backHref} label={backLabel} className="mb-5" />

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-[clamp(1.6rem,4vw,2.1rem)] font-semibold leading-tight">
                {title}
              </h1>
              {/* Granted by an admin, never self set. See developer_profiles.verified. */}
              {verified ? <Badge tone="accent">Verified</Badge> : null}
            </div>
            {lead ? (
              <p className="mt-3 text-[15px] leading-relaxed text-muted">{lead}</p>
            ) : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>

        <div className="mt-8">
          <DeveloperNav />
        </div>

        <div className="py-6">{children}</div>
      </Container>
    </AppShell>
  );
}
