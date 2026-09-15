import { requireAdmin } from "@/lib/admin/guard";
import { listSettings } from "@/lib/admin/queries";
import { SettingForm } from "@/components/admin/setting-form";
import {
  EmptyState,
  PageHeader,
  Panel,
  Section,
  Status,
  Table,
  TableWrap,
  Td,
  Th,
  Tr,
  labelFor,
} from "@/components/admin/ui";
import { ROLE_DESCRIPTION, ROLE_LABEL, MATRIX, STAFF_ROLES, CAPABILITIES } from "@/lib/admin/capabilities";

export const dynamic = "force-dynamic";

/*
  Platform configuration, and the permission matrix.

  Two stores are shown as one list, because to an administrator they are one
  thing. community_settings holds the moderation numbers and stays where it is:
  report_hide_threshold() and report_min_account_age_hours() read it directly,
  and moving those rows would mean rewriting working functions for tidiness.
  platform_settings holds everything else.

  Keys are created by migration and never by this form. An unknown key is
  refused rather than inserted, because a typo that silently creates a setting
  creates a setting nothing reads, which is worse than an error.

  Every change is audited with its before and after value and a required reason.
*/

const CATEGORY_LABEL: Record<string, string> = {
  features: "Feature flags",
  announcements: "Announcements",
  moderation: "Moderation",
  content: "Featured content",
  general: "General",
  ai: "AI",
};

const CATEGORY_LEAD: Record<string, string> = {
  features:
    "Switches that turn parts of the product on and off. Nothing reads these yet: they are declared here so the surfaces they gate can consult them as they ship.",
  announcements:
    "A banner shown across the product. Empty means nothing is shown, which is the default and the seeded value.",
  moderation:
    "The numbers the auto hide rule runs on. These are live: report_hide_threshold() reads them on every report.",
  content:
    "Slugs featured on Explore, in order. Empty means the section falls back to its ordinary ranking rather than showing a gap.",
  general: "Everything else.",
  ai: "Metadata about the AI configuration. What the gateway actually runs is an environment variable.",
};

const ORDER = ["moderation", "features", "announcements", "content", "ai", "general"];

export default async function AdminSettingsPage() {
  const session = await requireAdmin("settings.manage");
  const settings = await listSettings(session.db);

  const grouped = new Map<string, typeof settings>();
  for (const setting of settings) {
    const list = grouped.get(setting.category) ?? [];
    list.push(setting);
    grouped.set(setting.category, list);
  }
  const categories = [
    ...ORDER.filter((c) => grouped.has(c)),
    ...[...grouped.keys()].filter((c) => !ORDER.includes(c)),
  ];

  return (
    <>
      <PageHeader
        title="Settings"
        lead="Platform configuration. Every change is recorded in the audit log with its old value, its new value and a reason."
      />

      {settings.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No settings are readable"
            body="Either no settings exist, or the read was refused. The reason is in the server log."
          />
        </div>
      ) : (
        categories.map((category) => (
          <Section
            key={category}
            title={CATEGORY_LABEL[category] ?? labelFor(category)}
            lead={CATEGORY_LEAD[category]}
          >
            <div className="rounded-xl border border-border">
              {grouped.get(category)!.map((setting) => (
                <SettingForm
                  key={`${setting.scope}-${setting.key}`}
                  scope={setting.scope}
                  settingKey={setting.key}
                  value={setting.value}
                  description={setting.description}
                  updatedAt={setting.updated_at}
                />
              ))}
            </div>
          </Section>
        ))
      )}

      <Section
        title="Roles and permissions"
        lead="The rendered copy of the matrix. The authorization is the admin_capabilities table in the database, which every admin routine reads before it does anything."
      >
        <TableWrap>
          <Table className="min-w-[840px]">
            <thead>
              <tr>
                <Th>Capability</Th>
                {STAFF_ROLES.map((role) => (
                  <Th key={role}>{ROLE_LABEL[role]}</Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CAPABILITIES.map((capability) => (
                <Tr key={capability}>
                  <Td className="font-mono text-[12px]">{capability}</Td>
                  {STAFF_ROLES.map((role) => (
                    <Td key={role}>
                      {MATRIX[role].includes(capability) ? (
                        <Status value="ok" />
                      ) : (
                        <span className="text-muted">&#8722;</span>
                      )}
                    </Td>
                  ))}
                </Tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>

        <ul className="mt-4 divide-y divide-border rounded-xl border border-border">
          {STAFF_ROLES.map((role) => (
            <li key={role} className="px-4 py-3">
              <span className="text-[14px] font-medium">{ROLE_LABEL[role]}</span>
              <p className="mt-1 text-[13px] leading-relaxed text-muted">
                {ROLE_DESCRIPTION[role]}
              </p>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="What this page cannot change">
        <Panel className="px-4 py-4 text-[13px] leading-relaxed text-muted">
          <p>
            Keys are created by migration. This form updates a value and refuses an unknown key, so
            a typo is an error rather than a new setting that nothing reads.
          </p>
          <p className="mt-2">
            The permission matrix above is not editable here on purpose. Changing what a role may
            do is a migration, so it goes through review and leaves a schema history. A form that
            could grant a capability would be a form that could grant itself one.
          </p>
          <p className="mt-2">
            The AI provider, its models and its keys are environment variables read at request
            time, which is what keeps the model a config change rather than a rewrite. They are
            shown on the AI gateway page and changed in the deployment.
          </p>
        </Panel>
      </Section>
    </>
  );
}
