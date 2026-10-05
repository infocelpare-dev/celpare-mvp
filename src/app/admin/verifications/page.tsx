import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guard";
import { profilesByIds } from "@/lib/admin/queries";
import { decideToolVerification } from "@/app/actions/admin";
import { ActionForm } from "@/components/admin/action-form";
import { FilterTabs } from "@/components/admin/filters";
import { EmptyState, PageHeader, PersonCell, Status, When } from "@/components/admin/ui";
import { VerifiedTick } from "@/components/ui/verified-tick";

export const dynamic = "force-dynamic";

/*
  Requests for the blue tick (D201). An Elite developer asks from their tool
  page; this is where an admin accepts or declines.

  The developer's plan is shown on every row, because accepting needs Elite and
  admin_decide_tool_verification checks it again. A plan that is not Elite
  disables Accept here and says why; leaving Elite also cancels open requests,
  so that row should be rare.

  Oldest first, the same reasoning as the submissions queue.
*/

const TABS = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Accepted" },
  { key: "rejected", label: "Declined" },
  { key: "cancelled", label: "Cancelled" },
  { key: "all", label: "Everything" },
];

type RequestRow = {
  id: string;
  tool_id: string;
  developer_id: string;
  status: string;
  message: string | null;
  decision_reason: string | null;
  decided_at: string | null;
  created_at: string;
  tools: { name: string; slug: string; status: string; verified: boolean } | null;
};

const PLAN_LABEL: Record<string, string> = { free: "Free", pro: "Pro", elite: "Elite" };

export default async function AdminVerificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await requireAdmin("submissions.review");
  const sp = await searchParams;
  const status = TABS.some((t) => t.key === sp.status) ? sp.status! : "pending";

  let query = session.db
    .from("tool_verification_requests")
    .select(
      "id, tool_id, developer_id, status, message, decision_reason, decided_at, created_at, tools(name, slug, status, verified)",
    )
    .order("created_at", { ascending: status === "pending" })
    .limit(100);
  if (status !== "all") query = query.eq("status", status);
  const { data, error } = await query;
  /* A failed read is an error page, never an empty queue (rule 13). */
  if (error) throw new Error(`verification requests: ${error.message}`);
  const rows = (data ?? []) as unknown as RequestRow[];

  const devIds = [...new Set(rows.map((r) => r.developer_id))];
  const [owners, plans] = await Promise.all([
    profilesByIds(session.db, devIds),
    devIds.length
      ? session.db.from("developer_profiles").select("id, plan").in("id", devIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (plans.error) throw new Error(`developer plans: ${plans.error.message}`);
  const planOf = new Map(
    ((plans.data ?? []) as { id: string; plan: string }[]).map((p) => [p.id, p.plan]),
  );

  return (
    <>
      <PageHeader
        title="Verification requests"
        lead="Elite developers asking for the blue tick on a tool. Accepting checks the plan again and verifies the tool everywhere on Celpare."
      />

      <div className="mt-5">
        <FilterTabs
          label="Request status"
          active={`/admin/verifications?status=${status}`}
          items={TABS.map((t) => ({
            href: `/admin/verifications?status=${t.key}`,
            label: t.label,
            count: t.key === status ? rows.length : undefined,
          }))}
        />
      </div>

      {rows.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title={status === "pending" ? "No requests waiting" : "No requests with that status"}
            body={
              status === "pending"
                ? "When an Elite developer presses Request verification on their tool page, it appears here."
                : "Try another tab."
            }
          />
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {rows.map((r) => {
            const owner = owners.get(r.developer_id);
            const plan = planOf.get(r.developer_id) ?? null;
            const elite = plan === "elite";
            const name = r.tools?.name ?? "Deleted tool";

            return (
              <li key={r.id} className="rounded-xl border border-border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/admin/tools/${r.tool_id}`}
                        className="font-display text-[15px] font-semibold hover:underline"
                      >
                        {name}
                      </Link>
                      {r.tools?.verified ? <VerifiedTick label="Verified tool" /> : null}
                      <Status value={r.status} />
                      <span
                        className={
                          elite
                            ? "rounded-full bg-ok-surface px-2 py-0.5 text-[12px] font-medium text-ok-text"
                            : "rounded-full bg-warn-surface px-2 py-0.5 text-[12px] font-medium text-warn-text"
                        }
                      >
                        {plan ? `${PLAN_LABEL[plan] ?? plan} plan` : "No developer plan"}
                        {elite ? "" : ", not Elite"}
                      </span>
                    </div>

                    {r.message ? (
                      <p className="mt-2 max-w-[70ch] whitespace-pre-wrap text-[13px] leading-relaxed">
                        {r.message}
                      </p>
                    ) : (
                      <p className="mt-2 text-[13px] text-muted">No message.</p>
                    )}
                    {r.decision_reason ? (
                      <p className="mt-2 max-w-[70ch] text-[13px] leading-relaxed text-muted">
                        Decision: {r.decision_reason}
                      </p>
                    ) : null}

                    <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted">
                      <span>
                        Requested <When iso={r.created_at} time />
                      </span>
                      {r.decided_at ? (
                        <span>
                          Decided <When iso={r.decided_at} time />
                        </span>
                      ) : null}
                      {owner ? (
                        <PersonCell
                          id={owner.id}
                          username={owner.username}
                          fullName={owner.full_name}
                          avatarUrl={owner.avatar_url}
                          accountStatus={owner.account_status}
                        />
                      ) : null}
                    </div>
                  </div>

                  {r.tools ? (
                    <Link
                      href={`/tools/${r.tools.slug}`}
                      className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-[13px] text-muted transition-colors duration-200 ease-out hover:bg-surface hover:text-foreground"
                    >
                      Public page
                    </Link>
                  ) : null}
                </div>

                {r.status === "pending" ? (
                  <div className="mt-4 flex flex-wrap items-start gap-2 border-t border-border pt-4">
                    <ActionForm
                      action={decideToolVerification}
                      fields={{ id: r.id, decision: "approve" }}
                      label="Accept and verify"
                      tone="primary"
                      disabled={!elite}
                      disabledReason="Only an Elite developer's tool can be verified. Decline it, or change their plan first."
                      confirm={{
                        title: `Verify ${name}?`,
                        body: "The blue tick appears on the tool everywhere on Celpare. Only accept once you are satisfied this developer runs it.",
                        confirmLabel: "Verify",
                      }}
                    />
                    <ActionForm
                      action={decideToolVerification}
                      fields={{ id: r.id, decision: "reject" }}
                      label="Decline"
                      tone="danger"
                      requireReason
                      reasonLabel="Why, shown to the developer"
                      confirm={{
                        title: `Decline the request for ${name}?`,
                        body: "The developer sees your reason on their tool page and can ask again.",
                        confirmLabel: "Decline",
                      }}
                    />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
