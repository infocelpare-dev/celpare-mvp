import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guard";
import { getAiAnalytics, listModels, profilesByIds } from "@/lib/admin/queries";
import { FilterBar } from "@/components/admin/filters";
import {
  EmptyState,
  PageHeader,
  Pagination,
  PersonCell,
  Section,
  Status,
  Table,
  TableWrap,
  Td,
  Th,
  Tr,
  Usd,
  When,
} from "@/components/admin/ui";

export const dynamic = "force-dynamic";

const PER_PAGE = 25;

/*
  Models.

  Two different things share this page, and separating them is the point:

    The model DIRECTORY, public.models, is catalogue content. Developers submit
    entries, admins approve them, and they are what a visitor compares. They
    have no API keys and no runtime behaviour.

    The models Celpare RUNS are the gateway's, set by an env var and shown on
    the AI gateway page. They are not rows in this table and never will be.

  Conflating the two would be the security mistake here: a directory entry is
  user submitted content, and if editing it could change what answers a question
  then a developer could point the platform at their own endpoint. It cannot,
  because the gateway never reads this table.
*/
export default async function AdminModelsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const session = await requireAdmin("models.manage");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);

  const [{ rows, total }, ai] = await Promise.all([
    listModels(session.db, { search: sp.q, status: sp.status, page, perPage: PER_PAGE }),
    session.can("ai.read") ? getAiAnalytics(session.db, 30) : null,
  ]);

  const owners = await profilesByIds(session.db, rows.map((r) => r.developer_id));

  const query = (nextPage: number) => {
    const params = new URLSearchParams();
    if (sp.q) params.set("q", sp.q);
    if (sp.status) params.set("status", sp.status);
    if (nextPage > 1) params.set("page", String(nextPage));
    const s = params.toString();
    return s ? `/admin/models?${s}` : "/admin/models";
  };

  return (
    <>
      <PageHeader
        title="Models"
        lead="The model directory: catalogue entries people compare. The models Celpare actually runs are on the AI gateway page."
        action={
          session.can("ai.read") ? (
            <Link
              href="/admin/gateway"
              className="rounded-lg border border-border px-3 py-1.5 text-[13px] text-muted transition-colors duration-200 ease-out hover:bg-surface hover:text-foreground"
            >
              AI gateway
            </Link>
          ) : null
        }
      />

      <div className="mt-5">
        <FilterBar
          action="/admin/models"
          search={{ name: "q", placeholder: "Model name", value: sp.q }}
          selects={[
            {
              name: "status",
              label: "Status",
              value: sp.status,
              anyLabel: "Any status",
              options: [
                { value: "approved", label: "Approved" },
                { value: "pending", label: "Pending" },
                { value: "changes_required", label: "Changes required" },
                { value: "draft", label: "Draft" },
                { value: "rejected", label: "Rejected" },
              ],
            },
          ]}
        />
      </div>

      {rows.length === 0 ? (
        <div className="mt-5">
          <EmptyState
            title="No models in the directory"
            body="The models table is live with the same submission, review and ownership rules as tools. Nothing has been submitted or seeded into it yet."
          />
        </div>
      ) : (
        <>
          <div className="mt-5">
            <TableWrap>
              <Table className="min-w-[900px]">
                <thead>
                  <tr>
                    <Th>Model</Th>
                    <Th>Provider</Th>
                    <Th>Status</Th>
                    <Th numeric>Context</Th>
                    <Th numeric>Input / M</Th>
                    <Th numeric>Output / M</Th>
                    <Th>Modalities</Th>
                    <Th>Submitted by</Th>
                    <Th>Submitted</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((model) => {
                    const owner = model.developer_id ? owners.get(model.developer_id) : null;
                    return (
                      <Tr key={model.id}>
                        <Td>
                          <Link href={`/admin/models/${model.id}`} className="hover:underline">
                            <span className="block font-medium">{model.name}</span>
                            <span className="block font-mono text-[12px] text-muted">
                              {model.slug}
                            </span>
                          </Link>
                        </Td>
                        <Td className="text-[13px]">{model.provider}</Td>
                        <Td>
                          <Status value={model.status} />
                        </Td>
                        <Td numeric>
                          {model.context_window ? (
                            <span className="tnum">
                              {model.context_window.toLocaleString("en-GB")}
                            </span>
                          ) : (
                            <span className="text-muted">&#8722;</span>
                          )}
                        </Td>
                        <Td numeric>
                          {model.input_price_per_m != null ? (
                            <Usd value={Number(model.input_price_per_m)} />
                          ) : (
                            <span className="text-muted">&#8722;</span>
                          )}
                        </Td>
                        <Td numeric>
                          {model.output_price_per_m != null ? (
                            <Usd value={Number(model.output_price_per_m)} />
                          ) : (
                            <span className="text-muted">&#8722;</span>
                          )}
                        </Td>
                        <Td className="text-[13px] text-muted">
                          {model.modalities.length > 0 ? model.modalities.join(", ") : "−"}
                        </Td>
                        <Td>
                          {owner ? (
                            <PersonCell
                              id={owner.id}
                              username={owner.username}
                              fullName={owner.full_name}
                              avatarUrl={owner.avatar_url}
                              accountStatus={owner.account_status}
                            />
                          ) : (
                            <span className="text-[13px] text-muted">No owner</span>
                          )}
                        </Td>
                        <Td>
                          <When iso={model.submitted_at} />
                        </Td>
                      </Tr>
                    );
                  })}
                </tbody>
              </Table>
            </TableWrap>
          </div>

          <Pagination page={page} perPage={PER_PAGE} total={total} makeHref={query} />
        </>
      )}

      {/* Runtime numbers belong to the models that answer, not to the directory,
          so they are labelled as a different subject rather than dropped into
          the table above as if the two were the same list. */}
      {ai && ai.by_model.length > 0 ? (
        <Section
          title="Models in production"
          lead="What the gateway actually ran in the last 30 days. These are not directory entries."
        >
          <TableWrap>
            <Table className="min-w-[760px]">
              <thead>
                <tr>
                  <Th>Model</Th>
                  <Th>Provider</Th>
                  <Th numeric>Requests</Th>
                  <Th numeric>Tokens</Th>
                  <Th numeric>Cost</Th>
                  <Th numeric>Failed</Th>
                  <Th numeric>Avg latency</Th>
                </tr>
              </thead>
              <tbody>
                {ai.by_model.map((m) => (
                  <Tr key={`${m.provider}-${m.model}`}>
                    <Td className="font-mono text-[13px]">{m.model}</Td>
                    <Td className="text-[13px]">{m.provider}</Td>
                    <Td numeric>{m.requests.toLocaleString("en-GB")}</Td>
                    <Td numeric>
                      {(m.input_tokens + m.output_tokens).toLocaleString("en-GB")}
                    </Td>
                    <Td numeric>
                      <Usd value={m.cost_usd} />
                    </Td>
                    <Td numeric>
                      {m.failed > 0 ? (
                        <span className="tnum text-danger-text">{m.failed}</span>
                      ) : (
                        <span className="text-muted">&#8722;</span>
                      )}
                    </Td>
                    <Td numeric>{m.avg_latency} ms</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        </Section>
      ) : null}
    </>
  );
}
