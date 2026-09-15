import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guard";
import { listDevelopers } from "@/lib/admin/queries";
import { FilterBar } from "@/components/admin/filters";
import {
  Count,
  EmptyState,
  PageHeader,
  PersonCell,
  Stat,
  StatGrid,
  Status,
  Table,
  TableWrap,
  Td,
  Th,
  Tr,
  When,
} from "@/components/admin/ui";

export const dynamic = "force-dynamic";

/*
  Developers.

  The column that matters most is "Terms", and it is worth saying why it is not
  labelled "approved": there is no developer application to approve. Developer
  Mode is a switch on an ordinary account (D20), and the thing that grants the
  ability to submit anything is a developer_profiles row with accepted_terms_at
  set, written only by an RPC.

  So a developer here is in one of two states: they turned the mode on and
  accepted the terms, and can submit; or they turned it on and did not, and
  cannot. That is the whole model, and a column called "Pending approval" would
  imply a queue that does not exist and that nobody is working through.
*/
export default async function AdminDevelopersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await requireAdmin("developers.manage");
  const sp = await searchParams;

  const developers = await listDevelopers(session.db, sp.q);

  const active = developers.filter((d) => d.accepted_terms_at).length;
  const verified = developers.filter((d) => d.verified).length;
  const pending = developers.filter((d) => d.pending > 0).length;
  const suspended = developers.filter((d) => d.account_status !== "active").length;

  return (
    <>
      <PageHeader
        title="Developers"
        lead="Accounts with Developer Mode on. Submitting requires accepting the terms, which is recorded rather than approved."
      />

      <div className="mt-5">
        <StatGrid>
          <Stat label="Developer profiles" value={developers.length} />
          <Stat
            label="Can submit"
            value={active}
            hint="Terms accepted, so the write policies allow it"
          />
          <Stat
            label="Cannot submit"
            value={developers.length - active}
            tone={developers.length - active > 0 ? "warn" : "neutral"}
            hint="Mode on, terms not accepted"
          />
          <Stat label="Verified" value={verified} hint="Granted by an admin, never self set" />
          <Stat
            label="With work in review"
            value={pending}
            tone={pending > 0 ? "warn" : "neutral"}
          />
          <Stat
            label="Not in good standing"
            value={suspended}
            tone={suspended > 0 ? "danger" : "neutral"}
            hint="Suspended or disabled accounts"
          />
        </StatGrid>
      </div>

      <div className="mt-5">
        <FilterBar
          action="/admin/developers"
          search={{ name: "q", placeholder: "Developer handle", value: sp.q }}
        />
      </div>

      {developers.length === 0 ? (
        <div className="mt-5">
          <EmptyState
            title={sp.q ? "No developers match that handle" : "No developer profiles yet"}
            body={
              sp.q
                ? "Clear the search to see every developer."
                : "A profile is created the moment somebody turns Developer Mode on."
            }
          />
        </div>
      ) : (
        <div className="mt-5">
          <TableWrap>
            <Table className="min-w-[880px]">
              <thead>
                <tr>
                  <Th>Developer</Th>
                  <Th>Handle</Th>
                  <Th>Terms</Th>
                  <Th>Verified</Th>
                  <Th>Company</Th>
                  <Th numeric>Tools</Th>
                  <Th numeric>Models</Th>
                  <Th numeric>In review</Th>
                  <Th>Since</Th>
                </tr>
              </thead>
              <tbody>
                {developers.map((dev) => (
                  <Tr key={dev.id}>
                    <Td>
                      <PersonCell
                        id={dev.id}
                        username={dev.username}
                        fullName={dev.display_name}
                        avatarUrl={dev.avatar_url}
                        accountStatus={dev.account_status}
                      />
                    </Td>
                    <Td>
                      <Link
                        href={`/admin/developers/${dev.id}`}
                        className="font-mono text-[13px] hover:underline"
                      >
                        {dev.handle}
                      </Link>
                    </Td>
                    <Td>
                      {dev.accepted_terms_at ? (
                        <Status value="approved" />
                      ) : (
                        <Status value="pending" />
                      )}
                    </Td>
                    <Td>
                      {dev.verified ? (
                        <Status value="approved" />
                      ) : (
                        <span className="text-[13px] text-muted">No</span>
                      )}
                    </Td>
                    <Td className="text-[13px] text-muted">{dev.company ?? "−"}</Td>
                    <Td numeric>
                      <Count n={dev.tools} hideZero />
                    </Td>
                    <Td numeric>
                      <Count n={dev.models} hideZero />
                    </Td>
                    <Td numeric>
                      {dev.pending > 0 ? (
                        <span className="tnum text-warn-text">{dev.pending}</span>
                      ) : (
                        <span className="text-muted">&#8722;</span>
                      )}
                    </Td>
                    <Td>
                      <When iso={dev.created_at} />
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        </div>
      )}
    </>
  );
}
