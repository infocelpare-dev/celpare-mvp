import Link from "next/link";
import { cn } from "@/lib/utils";
import { formatCount } from "@/lib/format";

/*
  The admin dashboard's primitives.

  Denser than the product's. A Card in the product is rounded-2xl with 24px of
  padding, which is right for a page somebody reads and wrong for a table
  somebody scans: at that padding a screen holds eight rows. These sit at the
  same hairline border and flat surface, per D11, at roughly half the spacing.

  Everything that renders a number uses .tnum. A column of proportional digits
  cannot be compared down the column without reading every one of them.
*/

/* ---------------------------------------------------------- page framing */

export function PageHeader({
  title,
  lead,
  action,
}: {
  title: string;
  lead?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
      <div className="min-w-0">
        <h1 className="font-display text-[22px] font-semibold leading-tight sm:text-[26px]">
          {title}
        </h1>
        {lead ? <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{lead}</p> : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}

export function Section({
  title,
  lead,
  action,
  className,
  children,
}: {
  title?: string;
  lead?: string;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("mt-8", className)}>
      {title ? (
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-[15px] font-semibold">{title}</h2>
            {lead ? <p className="mt-1 text-[13px] text-muted">{lead}</p> : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Panel({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("rounded-xl border border-border", className)} {...props} />;
}

/* ----------------------------------------------------------------- stats */

export type Tone = "neutral" | "ok" | "warn" | "danger";

const TONE_TEXT: Record<Tone, string> = {
  neutral: "text-foreground",
  ok: "text-foreground",
  warn: "text-warn-text",
  danger: "text-danger-text",
};

/*
  A metric tile.

  Deliberately small: label, number, one line of context. The brief warned
  against huge empty dashboard cards, and the way that happens is a tile with
  four optional slots that usually has one filled. Three slots, all used.

  `hint` is where the honest zero goes. A count of nothing renders as 0 with a
  sentence saying why, never as a hidden tile or a dash, per D13 and D30.
*/
export function Stat({
  label,
  value,
  hint,
  tone = "neutral",
  href,
}: {
  label: string;
  value: number | string;
  hint?: string;
  tone?: Tone;
  href?: string;
}) {
  const body = (
    <>
      <div className="text-[12px] font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className={cn("tnum mt-1.5 font-display text-[26px] font-semibold leading-none", TONE_TEXT[tone])}>
        {typeof value === "number" ? value.toLocaleString("en-GB") : value}
      </div>
      {hint ? <div className="mt-1.5 text-[12px] leading-snug text-muted">{hint}</div> : null}
    </>
  );

  const className = cn(
    "block rounded-xl border border-border p-4",
    href && "transition-colors duration-200 ease-out hover:bg-surface",
  );

  return href ? (
    <Link href={href} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

/*
  Auto fitting rather than a fixed column count, so the same grid works at 390px
  and at 1440 without a breakpoint per section.

  156px rather than a rounder 168. Measured at 390px with a classic scrollbar
  the content column is 339px, and two 168px tiles plus the gap need 348, so the
  grid collapsed to a single very wide tile per row. 156 fits two with room to
  spare there and gives seven columns instead of six on a wide screen, which is
  the density this dashboard is supposed to have.
*/
export function StatGrid({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("grid grid-cols-[repeat(auto-fit,minmax(156px,1fr))] gap-3", className)}
      {...props}
    />
  );
}

/* A compact label and value pair, for detail pages where a grid of tiles would
   be too loud for what is mostly reference data. */
export function Field({
  label,
  children,
  mono = false,
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="border-b border-border py-2.5 last:border-b-0">
      <dt className="text-[12px] uppercase tracking-wide text-muted">{label}</dt>
      <dd className={cn("mt-1 break-words text-[14px]", mono && "font-mono text-[13px]")}>
        {children}
      </dd>
    </div>
  );
}

export function FieldList({ className, ...props }: React.ComponentProps<"dl">) {
  return <dl className={cn("rounded-xl border border-border px-4", className)} {...props} />;
}

/* ---------------------------------------------------------------- badges */

const TONE_BADGE: Record<Tone, string> = {
  neutral: "border border-border text-muted",
  ok: "bg-ok-surface text-ok-text",
  warn: "bg-warn-surface text-warn-text",
  danger: "bg-danger-surface text-danger-text",
};

/*
  A status pill. States a fact and is never interactive, the same distinction
  the product's Badge and ChipLink keep apart.
*/
export function StatusBadge({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-medium",
        TONE_BADGE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/*
  One table of meanings, so a status reads the same on every page.

  Colour here is severity, not decoration: approved and healthy are the same
  lime the brand already uses, anything needing attention is amber, anything
  broken or punitive is red. Everything else stays neutral rather than being
  given a colour it does not need.
*/
const STATUS_TONE: Record<string, Tone> = {
  // Catalogue
  approved: "ok",
  published: "ok",
  pending: "warn",
  changes_required: "warn",
  draft: "neutral",
  rejected: "danger",
  // Content
  visible: "ok",
  hidden: "warn",
  removed: "danger",
  // Accounts
  active: "ok",
  suspended: "danger",
  disabled: "danger",
  deleted: "danger",
  // Reports
  open: "warn",
  investigating: "warn",
  upheld: "danger",
  dismissed: "neutral",
  // Severity and health
  low: "neutral",
  normal: "neutral",
  medium: "warn",
  high: "danger",
  critical: "danger",
  healthy: "ok",
  degraded: "warn",
  down: "danger",
  unknown: "neutral",
  // Jobs
  succeeded: "ok",
  running: "warn",
  queued: "neutral",
  failed: "danger",
  // Sentry event levels, and the state of the Sentry connection itself
  fatal: "danger",
  warning: "warn",
  info: "neutral",
  debug: "neutral",
  not_configured: "neutral",
  // Usage record outcomes
  ok: "ok",
  error: "danger",
  rate_limited: "warn",
  refused_scope: "neutral",
  filtered: "warn",
};

export const STATUS_LABEL: Record<string, string> = {
  changes_required: "Changes required",
  refused_scope: "Out of scope",
  rate_limited: "Rate limited",
  dev_ops: "Developer ops",
  ai_ops: "AI ops",
  super_admin: "Super admin",

  /*
    Audit actions are stored as dotted keys so they can be filtered on exactly.
    Without these, the generic fallback capitalises the first letter of the whole
    string and leaves the dot in, giving "User.role changed". The stored key
    stays the stable one; this is only how it reads.
  */
  "user.status_changed": "Account status changed",
  "user.role_changed": "Role changed",
  "user.plan_changed": "Plan changed",
  "user.warned": "User warned",
  "content.status_changed": "Content status changed",
  "report.resolved": "Report resolved",
  "report.triaged": "Report triaged",
  "settings.changed": "Setting changed",
  "tool.approve": "Tool approved",
  "tool.reject": "Tool rejected",
  "tool.request_changes": "Tool changes requested",
  "tool.suspend": "Tool suspended",
  "tool.restore": "Tool restored",
  "tool.verified_changed": "Tool verification changed",
  "model.approve": "Model approved",
  "model.reject": "Model rejected",
  "model.request_changes": "Model changes requested",
  "model.suspend": "Model suspended",
  "model.restore": "Model restored",
  "developer.verified_changed": "Developer verification changed",

  /* Sentry. `error` already maps through the usage outcomes above and reads
     correctly; these are the levels that do not. */
  fatal: "Fatal",
  not_configured: "Not connected",

  /* Moderation action verbs, which are stored as bare words. */
  request_changes: "Changes requested",
  unsuspend: "Suspension lifted",
  unhide: "Restored to public view",
  unverify: "Verification removed",
};

export function labelFor(value: string): string {
  return STATUS_LABEL[value] ?? value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, " ");
}

export function Status({ value, className }: { value: string; className?: string }) {
  return (
    <StatusBadge tone={STATUS_TONE[value] ?? "neutral"} className={className}>
      {labelFor(value)}
    </StatusBadge>
  );
}

/* ---------------------------------------------------------------- tables */

/*
  The scroll container is on the table and not on the page.

  A wide table inside a page that scrolls sideways drags the whole layout with
  it, including the nav. One overflow-x-auto wrapper per table keeps the body
  fixed and lets the columns move, which is the pattern the ux guidance calls
  for on responsive tables.
*/
export function TableWrap({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("overflow-x-auto rounded-xl border border-border", className)}
      {...props}
    />
  );
}

export function Table({ className, ...props }: React.ComponentProps<"table">) {
  return <table className={cn("w-full min-w-[640px] text-left text-[14px]", className)} {...props} />;
}

export function Th({ className, numeric, ...props }: React.ComponentProps<"th"> & { numeric?: boolean }) {
  return (
    <th
      scope="col"
      className={cn(
        "whitespace-nowrap border-b border-border bg-surface px-3 py-2.5 text-[12px] font-medium uppercase tracking-wide text-muted",
        numeric && "text-right",
        className,
      )}
      {...props}
    />
  );
}

export function Td({ className, numeric, ...props }: React.ComponentProps<"td"> & { numeric?: boolean }) {
  return (
    <td
      className={cn(
        "border-b border-border px-3 py-2.5 align-middle",
        numeric && "tnum text-right",
        className,
      )}
      {...props}
    />
  );
}

export function Tr({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      className={cn("transition-colors duration-150 ease-out hover:bg-surface", className)}
      {...props}
    />
  );
}

/* A count rendered the product's way: 1.2K rather than 1200, hidden at zero
   where the zero carries no information. */
export function Count({ n, hideZero = false }: { n: number; hideZero?: boolean }) {
  if (hideZero && !n) return <span className="text-muted">&#8722;</span>;
  return <span className="tnum">{formatCount(n)}</span>;
}

/* ----------------------------------------------------- empty and failure */

/*
  Two different things, kept apart.

  Empty means the query worked and there is nothing there, which at launch is
  most of this dashboard and is not a fault. Failure means the read did not
  work. Rendering the second as the first is how a broken page looks calm.
*/
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center">
      <p className="font-display text-[15px] font-medium">{title}</p>
      {body ? (
        <p className="mx-auto mt-2 max-w-[46ch] text-[13px] leading-relaxed text-muted">{body}</p>
      ) : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ what }: { what: string }) {
  return (
    <div className="rounded-xl border border-danger-surface bg-danger-surface px-5 py-6">
      <p className="text-[14px] font-medium text-danger-text">Could not load {what}.</p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-danger-text/80">
        The query failed or your role does not allow it. The reason is in the server log.
        Nothing has been changed.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------ pagination */

/*
  Links, not buttons. A page is a place: it should survive a reload, be
  linkable, and go back where it came from. The same reasoning as the product's
  profile tabs.
*/
export function Pagination({
  page,
  perPage,
  total,
  makeHref,
}: {
  page: number;
  perPage: number;
  total: number;
  makeHref: (page: number) => string;
}) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  if (total === 0) return null;

  const first = (page - 1) * perPage + 1;
  const last = Math.min(page * perPage, total);

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[13px]">
      <p className="tnum text-muted">
        {first.toLocaleString("en-GB")} to {last.toLocaleString("en-GB")} of{" "}
        {total.toLocaleString("en-GB")}
      </p>
      {pages > 1 ? (
        <div className="flex items-center gap-2">
          {page > 1 ? (
            <Link
              href={makeHref(page - 1)}
              className="rounded-lg border border-border px-3 py-1.5 transition-colors duration-200 ease-out hover:bg-surface"
            >
              Previous
            </Link>
          ) : (
            <span className="rounded-lg border border-border px-3 py-1.5 text-muted opacity-50">
              Previous
            </span>
          )}
          <span className="tnum text-muted">
            {page} of {pages}
          </span>
          {page < pages ? (
            <Link
              href={makeHref(page + 1)}
              className="rounded-lg border border-border px-3 py-1.5 transition-colors duration-200 ease-out hover:bg-surface"
            >
              Next
            </Link>
          ) : (
            <span className="rounded-lg border border-border px-3 py-1.5 text-muted opacity-50">
              Next
            </span>
          )}
        </div>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------- people */

/*
  A person, everywhere a person appears in a list.

  Initials rather than a placeholder image when there is no avatar, matching
  D71 and the product's own Avatar. Suspended accounts are marked here rather
  than only on their detail page, so a moderator reading a queue can see it
  without opening anything.
*/
export function PersonCell({
  id,
  username,
  fullName,
  avatarUrl,
  accountStatus,
  sub,
}: {
  id?: string | null;
  username?: string | null;
  fullName?: string | null;
  avatarUrl?: string | null;
  accountStatus?: string;
  sub?: string;
}) {
  const name = username ?? fullName ?? "Unknown";
  const initials = (fullName ?? username ?? "?").slice(0, 2).toUpperCase();

  const inner = (
    <span className="flex min-w-0 items-center gap-2.5">
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt=""
          className="size-7 shrink-0 rounded-full border border-border object-cover"
        />
      ) : (
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-[11px] font-medium text-muted">
          {initials}
        </span>
      )}
      <span className="min-w-0">
        <span className="block truncate font-medium">{name}</span>
        {sub ? <span className="block truncate text-[12px] text-muted">{sub}</span> : null}
      </span>
      {accountStatus && accountStatus !== "active" ? <Status value={accountStatus} /> : null}
    </span>
  );

  if (!id) return inner;
  return (
    <Link href={`/admin/users/${id}`} className="hover:underline">
      {inner}
    </Link>
  );
}

/* --------------------------------------------------------------- dates */

/*
  Absolute date, relative in the title.

  An operations surface needs the actual timestamp: "3 days ago" is unusable
  for correlating an audit entry with a log line. The relative form is still
  useful for scanning, so it goes in the tooltip rather than replacing the date.
*/
export function When({ iso, time = false }: { iso: string | null | undefined; time?: boolean }) {
  if (!iso) return <span className="text-muted">&#8722;</span>;

  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return <span className="text-muted">&#8722;</span>;

  /*
    UTC, explicitly, and this is a correctness fix rather than a preference.

    Without `timeZone` these format in the runtime's own zone. The server and
    the browser are not always in the same one, so the server rendered "12:04"
    and a browser in Africa/Nairobi re-rendered "15:04", and React reported a
    hydration error on /admin/security. Found by Sentry within minutes of it
    being switched on, which is the whole argument for having it.

    Pinning to UTC also happens to be the right call for this surface
    independently. An audit log read by two people in different timezones is a
    timeline they cannot compare unless it states one zone, and `title` already
    carried the ISO string on the assumption that UTC is canonical here.
  */
  const date = d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  const clock = d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });

  return (
    <time dateTime={iso} title={d.toISOString()} className="tnum whitespace-nowrap text-[13px]">
      {time ? `${date}, ${clock} UTC` : date}
    </time>
  );
}

/* --------------------------------------------------------------- money */

/* Four decimal places, because a single AI request often costs less than a
   tenth of a cent and rounding it to 0.00 would make the per model table say
   every model is free. */
export function Usd({ value }: { value: number | null | undefined }) {
  const n = Number(value ?? 0);
  return <span className="tnum">${n < 1 ? n.toFixed(4) : n.toFixed(2)}</span>;
}
