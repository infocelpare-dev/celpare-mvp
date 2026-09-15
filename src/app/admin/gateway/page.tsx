import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guard";
import { getAiAnalytics } from "@/lib/admin/queries";
import { getGatewaySnapshot } from "@/lib/admin/health";
import { listSettings } from "@/lib/admin/queries";
import { SettingForm } from "@/components/admin/setting-form";
import {
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
  Usd,
} from "@/components/admin/ui";

export const dynamic = "force-dynamic";

/*
  The AI gateway control centre.

  READ ONLY, and that is a decision rather than an omission.

  What the gateway runs is an environment variable: AI_PROVIDER, OPENROUTER_MODEL
  and their siblings. That is what keeps D4 and D34 true, that the model is a
  config change rather than a rewrite, and it is also what makes it deployment
  state rather than database state. Making it editable from a web form would
  mean either writing to a settings table the gateway then has to consult on
  every request, or writing to the process environment from a request handler.
  The first adds a database read to the hot path of every answer and a way for a
  compromised admin session to point the platform at an arbitrary endpoint. The
  second is not something a serverless deployment can do.

  So this page shows what is running, what it costs and what it is allowed to
  do, and changing any of it is a deploy. The limits and feature grants below
  are the same constants the gateway itself reads, imported rather than copied,
  so this page cannot drift from the truth.

  NOTHING SECRET IS ON THIS PAGE. A key is reported as configured or not, never
  as a value, a prefix or a length. See the rule at the top of lib/admin/health.
*/
export default async function AdminGatewayPage() {
  const session = await requireAdmin("ai.read");

  const snapshot = getGatewaySnapshot();
  const ai = await getAiAnalytics(session.db, 7);

  /* The pause switch, read only for a role that can act on it. settings.manage
     is what admin_set_setting actually requires, so a role holding ai.configure
     without it sees the explanation and no control, which is honest: the form
     would refuse. */
  const pause = session.can("settings.manage")
    ? (await listSettings(session.db)).find((row) => row.key === "features.ask_celpare") ?? null
    : null;

  const t = ai?.totals ?? {};
  const requests = t.requests ?? 0;
  const errorRate = requests === 0 ? 0 : ((t.failed ?? 0) / requests) * 100;

  return (
    <>
      <PageHeader
        title="AI gateway"
        lead="What is answering, what it is allowed to do, and what it costs. Configuration is deployment state, so this page reports rather than edits."
        action={
          <Link
            href="/admin/ai"
            className="rounded-lg border border-border px-3 py-1.5 text-[13px] text-muted transition-colors duration-200 ease-out hover:bg-surface hover:text-foreground"
          >
            Usage and spend
          </Link>
        }
      />

      <Section title="Running now">
        <div className="grid gap-3 lg:grid-cols-2">
          <FieldList>
            <Field label="Active provider">
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{snapshot.provider}</span>
                {snapshot.provider === "mock" ? (
                  <Status value="degraded" />
                ) : snapshot.keyConfigured ? (
                  <Status value="healthy" />
                ) : (
                  <Status value="down" />
                )}
              </span>
            </Field>
            <Field label="Answering model" mono>
              {snapshot.answeringModel}
            </Field>
            <Field label="Classifier model" mono>
              {snapshot.classifierModel}
              {snapshot.classifierModel === snapshot.answeringModel ? (
                <span className="mt-1 block font-sans text-[12px] text-muted">
                  Same as the answering model. Deliberate: every small free model tested returned
                  unusable JSON, and it only runs on the ambiguous middle anyway.
                </span>
              ) : null}
            </Field>
            <Field label="Base URL" mono>
              {snapshot.baseUrl ?? "Provider default"}
            </Field>
            <Field label="API key">
              {snapshot.keyConfigured ? (
                /* Configured or not. Never the value, never a prefix, never a
                   length: four characters of a key is still four characters of
                   a key, and a length narrows which provider issued it. */
                <span className="text-ok-text">Configured</span>
              ) : (
                <span className="text-danger-text">Not configured</span>
              )}
            </Field>
            <Field label="Deliberation">
              Ordinary answers: {snapshot.answerThinking}. Deep research:{" "}
              {snapshot.researchThinking}.
            </Field>
          </FieldList>

          <div>
            <Panel className="p-4">
              <h3 className="text-[13px] font-medium">Providers the code can select</h3>
              <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
                There is no automatic failover. If the active provider is down, requests fail and
                are recorded as failures. Switching is an environment variable and a deploy.
              </p>
              <ul className="mt-3 divide-y divide-border">
                {snapshot.available.map((p) => (
                  <li key={p.name} className="flex items-center gap-2 py-2">
                    <span className="text-[13px] font-medium">{p.name}</span>
                    {p.selected ? <Status value="active" /> : null}
                    <span className="ml-auto text-[12px] text-muted">
                      {p.configured ? "Configured" : "No key"}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel className="mt-3 p-4">
              <h3 className="text-[13px] font-medium">Rate limiting</h3>
              <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
                Limits live in Upstash Redis, keyed by date with a TTL to UTC midnight, and they
                fail closed. The durable copy of what was spent is ai_usage_records, which is what
                every number on these pages is counted from.
              </p>
            </Panel>
          </div>
        </div>
      </Section>

      <Section title="Last seven days">
        <StatGrid>
          <Stat label="Requests" value={requests} />
          <Stat
            label="Errors"
            value={t.failed ?? 0}
            tone={errorRate > 5 ? "danger" : (t.failed ?? 0) > 0 ? "warn" : "neutral"}
            hint={`${errorRate.toFixed(1)}% of requests`}
          />
          <Stat
            label="Rate limited"
            value={t.rate_limited ?? 0}
            tone={(t.rate_limited ?? 0) > 0 ? "warn" : "neutral"}
            hint="Plan ceilings, not provider throttling"
          />
          <Stat label="Tokens" value={(t.total_tokens ?? 0).toLocaleString("en-GB")} />
          <Stat label="Estimated cost" value={`$${Number(t.cost_usd ?? 0).toFixed(4)}`} />
          <Stat label="P95 latency" value={`${ai?.latency.p95 ?? 0} ms`} />
        </StatGrid>
      </Section>

      <Section
        title="Prices"
        lead="Per million tokens, from the gateway configuration. This is what turns tokens back into an estimated dollar figure everywhere on these pages."
      >
        <TableWrap>
          <Table className="min-w-[420px]">
            <thead>
              <tr>
                <Th>Provider</Th>
                <Th numeric>Input / M</Th>
                <Th numeric>Output / M</Th>
              </tr>
            </thead>
            <tbody>
              {snapshot.prices.map((p) => (
                <Tr key={p.provider}>
                  <Td className="text-[13px]">{p.provider}</Td>
                  <Td numeric>
                    <Usd value={p.input} />
                  </Td>
                  <Td numeric>
                    <Usd value={p.output} />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      </Section>

      <Section
        title="Feature permissions"
        lead="Tool and web search are granted per AI feature rather than once for everything, so adding a feature is a row and a prompt rather than a new pipeline."
      >
        <TableWrap>
          <Table className="min-w-[520px]">
            <thead>
              <tr>
                <Th>Feature</Th>
                <Th>Shipped</Th>
                <Th>Tool search</Th>
                <Th>Web search</Th>
              </tr>
            </thead>
            <tbody>
              {snapshot.features.map((f) => (
                <Tr key={f.key}>
                  <Td>
                    <span className="font-medium">{f.label}</span>
                    <span className="ml-2 font-mono text-[12px] text-muted">{f.key}</span>
                  </Td>
                  <Td>{f.shipped ? <Status value="active" /> : <span className="text-[13px] text-muted">Not yet</span>}</Td>
                  <Td className="text-[13px] text-muted">{f.toolSearch ? "Allowed" : "No"}</Td>
                  <Td className="text-[13px] text-muted">{f.webSearch ? "Allowed" : "No"}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      </Section>

      <Section
        title="Plan ceilings"
        lead="Enforced in Redis before any spend. A higher plan can never buy less than a lower one: that relationship is asserted when the module loads."
      >
        <TableWrap>
          <Table className="min-w-[860px]">
            <thead>
              <tr>
                <Th>Plan</Th>
                <Th numeric>Messages / day</Th>
                <Th numeric>Input / day</Th>
                <Th numeric>Output / day</Th>
                <Th numeric>Input / month</Th>
                <Th numeric>Output / month</Th>
                <Th numeric>Max reply</Th>
                <Th>Web search</Th>
                <Th>Research</Th>
              </tr>
            </thead>
            <tbody>
              {snapshot.planLimits.map((p) => (
                <Tr key={p.plan}>
                  <Td className="font-medium">{p.plan}</Td>
                  <Td numeric>{p.messagesPerDay.toLocaleString("en-GB")}</Td>
                  <Td numeric>{p.dailyInputTokens.toLocaleString("en-GB")}</Td>
                  <Td numeric>{p.dailyOutputTokens.toLocaleString("en-GB")}</Td>
                  <Td numeric>{p.monthlyInputTokens.toLocaleString("en-GB")}</Td>
                  <Td numeric>{p.monthlyOutputTokens.toLocaleString("en-GB")}</Td>
                  <Td numeric>{p.maxOutputPerReply.toLocaleString("en-GB")}</Td>
                  <Td className="text-[13px] text-muted">{p.webSearch ? "Yes" : "No"}</Td>
                  <Td className="text-[13px] text-muted">{p.researchMode ? "Yes" : "No"}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      </Section>

      <Section title="Retrieval">
        <StatGrid>
          <Stat
            label="Tools per answer"
            value={snapshot.toolSearchLimit}
            hint="The most catalogue rows one answer may cite"
          />
          <Stat
            label="Web results"
            value={snapshot.webSearchLimit}
            hint="Per ordinary answer"
          />
          <Stat
            label="Catalogue threshold"
            value={snapshot.minCatalogueMatch}
            hint="Below this many matches, the web is worth one call"
          />
          <Stat
            label="Research queries"
            value={snapshot.researchQueries}
            hint="Angles a deep research turn searches"
          />
          <Stat
            label="Research sources"
            value={snapshot.researchMaxResults}
            hint="Pooled cap after deduplication"
          />
        </StatGrid>
      </Section>

      {session.can("ai.configure") ? (
        <Section title="Changing any of this">
          <Panel className="px-4 py-4 text-[13px] leading-relaxed text-muted">
            The provider, the models and the keys are environment variables read at request time,
            which is what keeps the model a config change rather than a rewrite. They are not
            editable here: doing that would mean either a database read on the hot path of every
            answer, or writing to the process environment from a request handler. Change them in
            the deployment and redeploy.
            <br />
            <br />
            The one exception is below. Whether the gateway answers at all is worth being able to
            change without a deploy, because it is the only way to stop spend during an incident.
            It costs one settings read per request, next to a call that takes seconds and costs
            money, so the objection above does not apply to it.
          </Panel>

          {pause ? (
            <div className="mt-3">
              <SettingForm
                scope="platform"
                settingKey={pause.key}
                value={pause.value}
                description={pause.description}
                updatedAt={pause.updated_at}
              />
            </div>
          ) : null}
        </Section>
      ) : null}
    </>
  );
}
