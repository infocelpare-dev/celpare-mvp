import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/guard";
import {
  listModerationActions,
  listSubmissions,
  profilesByIds,
} from "@/lib/admin/queries";
import { setDeveloperVerified } from "@/app/actions/admin";
import { ActionForm } from "@/components/admin/action-form";
import {
  EmptyState,
  Field,
  FieldList,
  PageHeader,
  Panel,
  Section,
  Stat,
  StatGrid,
  Status,
  Table,
  TableWrap,
  Td,
  Th,
  Tr,
  When,
  labelFor,
} from "@/components/admin/ui";

export const dynamic = "force-dynamic";

type DeveloperRecord = {
  id: string;
  handle: string;
  display_name: string | null;
  bio: string | null;
  company: string | null;
  website_url: string | null;
  github_url: string | null;
  description: string | null;
  expertise: string[];
  logo_url: string | null;
  verified: boolean;
  accepted_terms_at: string | null;
  terms_version: string | null;
  created_at: string;
};

/*
  One developer, and everything they have put into the catalogue.

  What is NOT here, and it is worth being explicit: nothing private. No API
  keys, because developers do not have any. No contact details beyond what they
  published on their own developer profile. No conversations, no searches. An
  administrator can see what a developer has submitted and how it was reviewed,
  because that is the administrative function, and nothing beyond it.
*/
export default async function AdminDeveloperDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireAdmin("developers.manage");
  const { id } = await params;

  const { data } = await session.db
    .from("developer_profiles")
    .select(
      "id, handle, display_name, bio, company, website_url, github_url, description, expertise, logo_url, verified, accepted_terms_at, terms_version, created_at",
    )
    .eq("id", id)
    .maybeSingle();

  const dev = data as DeveloperRecord | null;
  if (!dev) notFound();

  const [profiles, submissions, history] = await Promise.all([
    profilesByIds(session.db, [dev.id]),
    listSubmissions(session.db, "all"),
    listModerationActions(session.db, { targetUser: dev.id }),
  ]);

  const account = profiles.get(dev.id);
  const theirs = submissions.filter((s) => s.developer_id === dev.id);

  const count = (status: string) => theirs.filter((s) => s.status === status).length;

  return (
    <>
      <PageHeader
        title={dev.display_name ?? dev.handle}
        lead={dev.company ?? undefined}
        action={
          <>
            <Link
              href={`/admin/users/${dev.id}`}
              className="rounded-lg border border-border px-3 py-1.5 text-[13px] text-muted transition-colors duration-200 ease-out hover:bg-surface hover:text-foreground"
            >
              Account
            </Link>
            <Link
              href="/admin/developers"
              className="rounded-lg border border-border px-3 py-1.5 text-[13px] text-muted transition-colors duration-200 ease-out hover:bg-surface hover:text-foreground"
            >
              All developers
            </Link>
          </>
        }
      />

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="font-mono text-[13px] text-muted">{dev.handle}</span>
        {dev.verified ? (
          <span className="rounded-full bg-ok-surface px-2 py-0.5 text-[12px] font-medium text-ok-text">
            Verified
          </span>
        ) : null}
        {dev.accepted_terms_at ? (
          <Status value="active" />
        ) : (
          <span className="rounded-full bg-warn-surface px-2 py-0.5 text-[12px] font-medium text-warn-text">
            Terms not accepted
          </span>
        )}
        {account && account.account_status !== "active" ? (
          <Status value={account.account_status} />
        ) : null}
      </div>

      {!dev.accepted_terms_at ? (
        <div className="mt-4 rounded-xl border border-warn-surface bg-warn-surface px-4 py-3">
          <p className="text-[13px] leading-relaxed text-warn-text">
            This developer has turned Developer Mode on but has not accepted the terms, so every
            write policy on tools and models refuses them. There is nothing to approve here: they
            accept the terms themselves, and only then can they submit.
          </p>
        </div>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <Section title="Catalogue">
            <StatGrid>
              <Stat label="Submissions" value={theirs.length} />
              <Stat label="Approved" value={count("approved")} tone="ok" />
              <Stat
                label="In review"
                value={count("pending")}
                tone={count("pending") > 0 ? "warn" : "neutral"}
              />
              <Stat label="Drafts" value={count("draft")} />
              <Stat
                label="Changes required"
                value={count("changes_required")}
                tone={count("changes_required") > 0 ? "warn" : "neutral"}
              />
              <Stat
                label="Rejected"
                value={count("rejected")}
                tone={count("rejected") > 0 ? "danger" : "neutral"}
              />
            </StatGrid>
          </Section>

          <Section title="Submission history">
            {theirs.length === 0 ? (
              <EmptyState
                title="Nothing submitted"
                body="This developer has not created a tool or a model yet."
              />
            ) : (
              <TableWrap>
                <Table className="min-w-[620px]">
                  <thead>
                    <tr>
                      <Th>Name</Th>
                      <Th>Kind</Th>
                      <Th>Status</Th>
                      <Th>Submitted</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {theirs.map((item) => (
                      <Tr key={`${item.kind}-${item.id}`}>
                        <Td>
                          <Link
                            href={`/admin/${item.kind}s/${item.id}`}
                            className="font-medium hover:underline"
                          >
                            {item.name}
                          </Link>
                        </Td>
                        <Td className="text-[13px] text-muted">{item.kind}</Td>
                        <Td>
                          <Status value={item.status} />
                        </Td>
                        <Td>
                          <When iso={item.submitted_at} />
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </TableWrap>
            )}
          </Section>

          <Section title="Moderation history">
            {history.length === 0 ? (
              <EmptyState
                title="No moderation history"
                body="Warnings, suspensions and review decisions against this developer appear here."
              />
            ) : (
              <ul className="divide-y divide-border rounded-xl border border-border">
                {history.map((entry) => (
                  <li key={entry.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-baseline gap-x-3">
                      <span className="text-[13px] font-medium">{labelFor(entry.action)}</span>
                      <span className="text-[12px] text-muted">on {entry.entity_type}</span>
                      <span className="ml-auto text-[12px] text-muted">
                        <When iso={entry.created_at} time />
                      </span>
                    </div>
                    {entry.reason ? (
                      <p className="mt-1 text-[13px] leading-relaxed text-muted">{entry.reason}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        <div className="min-w-0">
          <Section title="Profile">
            <FieldList>
              <Field label="Developer id" mono>
                {dev.id}
              </Field>
              <Field label="Handle">{dev.handle}</Field>
              <Field label="Display name">{dev.display_name ?? "Not set"}</Field>
              <Field label="Company">{dev.company ?? "Not set"}</Field>
              <Field label="Website">
                {dev.website_url ? (
                  <a
                    href={dev.website_url}
                    rel="nofollow noopener noreferrer"
                    target="_blank"
                    className="break-all hover:underline"
                  >
                    {dev.website_url}
                  </a>
                ) : (
                  "Not set"
                )}
              </Field>
              <Field label="GitHub">
                {dev.github_url ? (
                  <a
                    href={dev.github_url}
                    rel="nofollow noopener noreferrer"
                    target="_blank"
                    className="break-all hover:underline"
                  >
                    {dev.github_url}
                  </a>
                ) : (
                  "Not set"
                )}
              </Field>
              <Field label="Expertise">
                {dev.expertise.length > 0 ? dev.expertise.join(", ") : "Not set"}
              </Field>
              <Field label="Terms">
                {dev.accepted_terms_at ? (
                  <>
                    <When iso={dev.accepted_terms_at} time />
                    <span className="ml-2 text-muted">version {dev.terms_version ?? "unknown"}</span>
                  </>
                ) : (
                  <span className="text-warn-text">Not accepted</span>
                )}
              </Field>
              <Field label="Profile created">
                <When iso={dev.created_at} time />
              </Field>
            </FieldList>
          </Section>

          <Section title="Verification">
            <Panel className="p-4">
              <p className="text-[13px] leading-relaxed text-muted">
                A verified developer is one Celpare has confirmed is who they say they are. It is
                granted here and nowhere else: developer_profiles.verified is absent from every
                client grant, so it cannot be self set.
              </p>
              <div className="mt-3">
                <ActionForm
                  action={setDeveloperVerified}
                  fields={{ id: dev.id, verified: dev.verified ? "no" : "yes" }}
                  label={dev.verified ? "Remove verification" : "Mark as verified"}
                  tone={dev.verified ? "danger" : "primary"}
                  requireReason
                  reasonLabel="How this was confirmed"
                  confirm={{
                    title: dev.verified ? "Remove the verified mark?" : "Verify this developer?",
                    body: dev.verified
                      ? "The badge disappears from their profile and from their tools."
                      : "A verified badge appears on their profile. Only do this once identity has actually been confirmed, and say how in the reason.",
                    confirmLabel: dev.verified ? "Remove verification" : "Verify",
                  }}
                />
              </div>
            </Panel>
          </Section>

          <Section title="Account actions">
            <Panel className="px-4 py-4 text-[13px] leading-relaxed text-muted">
              Suspending a developer means suspending the person, so it lives on their{" "}
              <Link href={`/admin/users/${dev.id}`} className="underline">
                account page
              </Link>
              . There is one identity here, not two: the Celpare account is the developer account.
            </Panel>
          </Section>
        </div>
      </div>
    </>
  );
}
