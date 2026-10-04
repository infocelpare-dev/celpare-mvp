import { Check, Minus } from "lucide-react";
import type { Cell, CompareGroup, PricingPlan } from "@/lib/pricing/plans";

/*
  Every plan side by side, grouped like the claude.com/pricing table. A real
  table, so a screen reader announces the plan and the row for each cell.

  At phone width it scrolls inside its own box rather than squeezing three
  columns of text into 358px or pushing the page sideways. The box is
  `relative` because the sr-only labels in the cells are absolutely positioned:
  without a positioned ancestor they escape the scroll clip and widen the page.
*/
export function CompareTable({
  plans,
  groups,
}: {
  plans: PricingPlan[];
  groups: CompareGroup[];
}) {
  return (
    <div className="relative overflow-x-auto rounded-3xl border border-border bg-elevated">
      <table className="w-full min-w-[640px] table-fixed border-collapse text-left text-[15px]">
        <caption className="sr-only">Compare plans</caption>
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className="w-[31%] px-6 py-5 font-medium text-muted">
              <span className="sr-only">Feature</span>
            </th>
            {plans.map((plan) => (
              <th
                key={plan.id}
                scope="col"
                className="px-4 py-5 text-[17px] font-medium tracking-[-0.02em]"
              >
                {plan.name}
              </th>
            ))}
          </tr>
        </thead>
        {groups.map((group) => (
          <tbody key={group.title}>
            <tr>
              <th
                scope="colgroup"
                colSpan={plans.length + 1}
                className="px-6 pb-2 pt-6 text-[13px] font-medium uppercase tracking-[0.06em] text-muted"
              >
                {group.title}
              </th>
            </tr>
            {group.rows.map((row) => (
              <tr key={row.label} className="border-t border-border first:border-t-0">
                <th scope="row" className="px-6 py-3.5 font-normal">
                  {row.label}
                </th>
                {row.cells.map((cell, i) => (
                  <td key={plans[i].id} className="px-4 py-3.5">
                    <CellValue cell={cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}

function CellValue({ cell }: { cell: Cell }) {
  if (cell === true) {
    return (
      <>
        <Check className="size-4" aria-hidden />
        <span className="sr-only">Included</span>
      </>
    );
  }
  if (cell === false) {
    return (
      <>
        <Minus className="size-4 text-muted" aria-hidden />
        <span className="sr-only">Not included</span>
      </>
    );
  }
  return <span>{cell}</span>;
}
