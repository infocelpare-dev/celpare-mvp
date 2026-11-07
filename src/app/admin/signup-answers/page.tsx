import { requireAdmin } from "@/lib/admin/guard";
import { ErrorState, PageHeader, Table, TableWrap, Td, Th, Tr } from "@/components/admin/ui";
import { getOnboardingSummary, type Count, type OnboardingSummary } from "@/lib/onboarding/server";
import { GOALS, HEARD_FROM, labelOf, ROLES, type Choice } from "@/lib/onboarding/options";

export const dynamic = "force-dynamic";

/*
  Sign up answers (founder, 2026-11-02): what new accounts chose in the
  questions after sign up, as percentages over the last 7, 30 and 90 days side
  by side. Counts only, never one person's answers (D226, Privacy Policy).

  Each percentage divides by the accounts that answered THAT question in that
  window, so a skipped question does not dilute the others. Goals, interests
  and tools allow several picks, so their column can add up past 100%.
*/

const WINDOWS = [7, 30, 90] as const;
type Win = (typeof WINDOWS)[number];
type Summaries = Record<Win, OnboardingSummary>;
type Totals = OnboardingSummary["totals"];

type Question = {
  title: string;
  lead: string;
  base: keyof Totals;
  counts: (s: OnboardingSummary) => Count[];
  labels?: readonly Choice[];
  /* Every choice in a fixed list is shown, even at 0%, so a gap is visible. */
  allChoices?: boolean;
  multi?: boolean;
};

const QUESTIONS: Question[] = [
  {
    title: "Where they heard about Celpare",
    lead: "One channel each.",
    base: "answered_heard",
    counts: (s) => s.heard_from,
    labels: HEARD_FROM,
    allChoices: true,
  },
  {
    title: "Who they are",
    lead: "What best describes them, one each.",
    base: "answered_role",
    counts: (s) => s.roles,
    labels: ROLES,
    allChoices: true,
  },
  {
    title: "What they came to do",
    lead: "Several picks allowed, so the column can add up past 100%.",
    base: "answered_goals",
    counts: (s) => s.goals,
    labels: GOALS,
    allChoices: true,
    multi: true,
  },
  {
    title: "Interests",
    lead: "Categories and topics. Several picks allowed.",
    base: "answered_interests",
    counts: (s) => [...s.categories, ...s.topics],
    multi: true,
  },
  {
    title: "Tools they already use",
    lead: "The 20 most picked catalogue tools. Several picks allowed.",
    base: "answered_tools",
    counts: (s) => s.tools,
    multi: true,
  },
  {
    title: "Campaign links",
    lead: "Sign ups that arrived through a link with ?ref= or ?utm_source=.",
    base: "answered_ref",
    counts: (s) => s.refs,
  },
];

function pct(n: number, d: number): string {
  if (d <= 0) return "";
  const p = (n / d) * 100;
  if (n > 0 && p < 1) return "<1%";
  return `${Math.round(p)}%`;
}

/* Rows for one question across the three windows, ordered by the 90 day share. */
function rowsFor(q: Question, s: Summaries) {
  const keys = new Set<string>(q.allChoices && q.labels ? q.labels.map((c) => c.key) : []);
  for (const w of WINDOWS) for (const c of q.counts(s[w])) keys.add(c.key);
  const countIn = (w: Win, key: string) => q.counts(s[w]).find((c) => c.key === key)?.count ?? 0;
  return [...keys]
    .map((key) => ({
      key,
      label: q.labels ? labelOf(q.labels, key) : key,
      by: Object.fromEntries(WINDOWS.map((w) => [w, countIn(w, key)])) as Record<Win, number>,
    }))
    .sort((a, b) => b.by[90] - a.by[90] || b.by[30] - a.by[30] || b.by[7] - a.by[7] || a.label.localeCompare(b.label));
}

function Cell({ n, base }: { n: number; base: number }) {
  if (base <= 0) return <Td numeric className="text-muted">&#8722;</Td>;
  return (
    <Td numeric>
      <span className={n > 0 ? "font-medium" : "text-muted"}>{pct(n, base)}</span>
      <span className="ms-1.5 text-[12px] text-muted">{n}</span>
    </Td>
  );
}

function QuestionTable({ q, s }: { q: Question; s: Summaries }) {
  const rows = rowsFor(q, s);
  const base = (w: Win) => Number(s[w].totals[q.base] ?? 0);
  return (
    <section className="mt-8">
      <h2 className="font-display text-[17px] font-medium tracking-[-0.01em]">{q.title}</h2>
      <p className="mt-0.5 text-[13px] text-muted">{q.lead}</p>
      {rows.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed border-border px-4 py-6 text-center text-[13px] text-muted">
          Nobody has answered this yet.
        </p>
      ) : (
        <TableWrap className="mt-3">
          <Table className="min-w-[420px] table-fixed">
            <thead>
              <tr>
                <Th className="w-auto">Answer</Th>
                {WINDOWS.map((w) => (
                  <Th key={w} numeric className="w-[92px] sm:w-[120px]">
                    {w} days
                  </Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Tr key={r.key}>
                  <Td className="truncate" title={r.label}>
                    {r.label}
                  </Td>
                  {WINDOWS.map((w) => (
                    <Cell key={w} n={r.by[w]} base={base(w)} />
                  ))}
                </Tr>
              ))}
              <tr className="text-[12px] text-muted">
                <Td className="border-b-0">Answered this question</Td>
                {WINDOWS.map((w) => (
                  <Td key={w} numeric className="border-b-0">
                    {base(w)}
                  </Td>
                ))}
              </tr>
            </tbody>
          </Table>
        </TableWrap>
      )}
    </section>
  );
}

function Overview({ s }: { s: Summaries }) {
  const lines: { label: string; value: (t: Totals) => string }[] = [
    { label: "New accounts", value: (t) => t.signups.toLocaleString("en-GB") },
    { label: "Saw the questions", value: (t) => t.started.toLocaleString("en-GB") },
    {
      label: "Answered to the end",
      value: (t) => (t.started > 0 ? `${pct(t.completed, t.started)} (${t.completed})` : "None yet"),
    },
    {
      label: "Skipped everything",
      value: (t) => (t.started > 0 ? `${pct(t.skipped_all, t.started)} (${t.skipped_all})` : "None yet"),
    },
  ];
  return (
    <TableWrap className="mt-6">
      <Table className="min-w-[420px] table-fixed">
        <thead>
          <tr>
            <Th className="w-auto">New accounts</Th>
            {WINDOWS.map((w) => (
              <Th key={w} numeric className="w-[92px] sm:w-[120px]">
                {w} days
              </Th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <Tr key={l.label}>
              <Td>{l.label}</Td>
              {WINDOWS.map((w) => (
                <Td key={w} numeric>
                  {l.value(s[w].totals)}
                </Td>
              ))}
            </Tr>
          ))}
        </tbody>
      </Table>
    </TableWrap>
  );
}

export default async function SignupAnswersPage() {
  const session = await requireAdmin("analytics.read");
  const [s7, s30, s90] = await Promise.all(WINDOWS.map((w) => getOnboardingSummary(session.db, w)));

  return (
    <>
      <PageHeader
        title="Sign up answers"
        lead="What new accounts chose in the questions after sign up, as a share of the people who answered each question. Totals only, never one person's answers."
      />
      {!s7 || !s30 || !s90 ? (
        <div className="mt-6">
          <ErrorState what="sign up answers" />
        </div>
      ) : (
        <>
          <Overview s={{ 7: s7, 30: s30, 90: s90 }} />
          {QUESTIONS.map((q) => (
            <QuestionTable key={q.title} q={q} s={{ 7: s7, 30: s30, 90: s90 }} />
          ))}
          {s90.heard_other.length > 0 ? (
            <section className="mt-8">
              <h2 className="font-display text-[17px] font-medium tracking-[-0.01em]">Somewhere else, in their words</h2>
              <p className="mt-0.5 text-[13px] text-muted">What people typed when no channel fitted, last 90 days.</p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {s90.heard_other.map((h) => (
                  <li key={h.key} className="rounded-full border border-border px-3 py-1 text-[13px]">
                    {h.key} <span className="text-muted">{h.count}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <p className="mt-8 text-[12px] leading-relaxed text-muted">
            Accounts made before the questions existed were never asked, so they are not counted. A dash means
            nobody answered that question in that window.
          </p>
        </>
      )}
    </>
  );
}
