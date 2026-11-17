import { EmptyState, Panel, Section, Status, When } from "@/components/admin/ui";
import { getSentryReplaysForUser, sentryConfigured } from "@/lib/admin/sentry";

/*
  One account's session recordings, on /admin/users/[id] (D269). Super admin
  only: the page decides that before rendering this.

  This does not break the page's privacy rule. A recording shows where somebody
  went and what they clicked; all text and every input is masked in the
  browser before it is sent, so there is no conversation, search or message to
  read here or in Statsig or Sentry.

  Statsig holds the full set (every session). Its console has no API we can
  read, so that part is a link plus the id to filter by. Sentry holds a sample
  and every session that hit an error, and those are listed.
*/

const STATSIG_REPLAYS = "https://console.statsig.com/4odCGWCV4s4J8bVvy5rmlM/session_replay";

function seconds(ms: number): string {
  const s = Math.round(ms / 1000);
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
}

function Out({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="underline underline-offset-2 transition-colors duration-200 ease-out hover:text-foreground"
    >
      {children}
    </a>
  );
}

export async function Recordings({ userId }: { userId: string }) {
  /* Not connected and a failed read are told apart: one is a missing setting,
     the other is Sentry being unreachable, and they need different fixes. */
  const connected = sentryConfigured();
  const replays = connected ? await getSentryReplaysForUser(userId) : null;

  return (
    <Section
      title="Recordings"
      lead="What this person did on Celpare: pages, clicks and scrolls. Text and form fields are masked before they leave the browser, so nothing they wrote or read is shown."
    >
      <Panel className="px-4 py-4 text-[13px] leading-relaxed text-muted">
        <p>
          Every session is recorded in Statsig. Open the recordings and filter by this User ID:
        </p>
        <p className="mt-2 select-all break-all font-mono text-[12px] text-foreground">{userId}</p>
        <p className="mt-3">
          <Out href={STATSIG_REPLAYS}>Open Statsig recordings</Out>
        </p>
      </Panel>

      <div className="mt-3">
        {!connected ? (
          <Panel className="px-4 py-4 text-[13px] text-muted">
            Sentry replays are not shown: SENTRY_API_TOKEN is not set on this deployment. Statsig above
            still has every session. See Errors and performance for how to connect it.
          </Panel>
        ) : replays === null ? (
          <Panel className="px-4 py-4 text-[13px] text-muted">
            Sentry replays could not be read just now. This is not the same as there being none.
          </Panel>
        ) : replays.length === 0 ? (
          <EmptyState
            title="No Sentry replays in the last 30 days"
            body="Sentry keeps a sample of sessions and every session that hit an error. Statsig has the full set."
          />
        ) : (
          <ul className="space-y-2">
            {replays.map((replay) => (
              <li key={replay.id} className="rounded-xl border border-border p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Status value={replay.errors > 0 ? "failed" : "ok"} />
                  <span className="text-[12px] text-muted">
                    <When iso={replay.startedAt} time />
                  </span>
                  <span className="ml-auto text-[12px] text-muted">
                    <Out href={replay.permalink}>Watch in Sentry</Out>
                  </span>
                </div>
                {replay.url ? <p className="mt-2 break-all font-mono text-[12px]">{replay.url}</p> : null}
                <p className="mt-2 text-[12px] text-muted">
                  {seconds(replay.durationMs)} long, {replay.errors} errors
                  {replay.rageClicks > 0 ? `, ${replay.rageClicks} rage clicks` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Section>
  );
}
