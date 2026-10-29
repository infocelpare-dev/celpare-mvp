import type { Doc } from "../types";
import { gettingStarted, plans, yourData } from "./start";
import { askCelpare, compare, explore, search } from "./discover";
import { community, messages, notifications, profileAndPrivacy } from "./people";
import { developers, sponsoredTools } from "./developers";

export const HELP_GROUPS: { title: string; docs: Doc[] }[] = [
  { title: "Start", docs: [gettingStarted, yourData, plans] },
  { title: "Find the right tool", docs: [askCelpare, search, explore, compare] },
  { title: "Community", docs: [community, messages, profileAndPrivacy, notifications] },
  { title: "Developers", docs: [developers, sponsoredTools] },
];

export const HELP_DOCS: Doc[] = HELP_GROUPS.flatMap((g) => g.docs);

export function helpDoc(slug: string): Doc | undefined {
  return HELP_DOCS.find((d) => d.slug === slug);
}
