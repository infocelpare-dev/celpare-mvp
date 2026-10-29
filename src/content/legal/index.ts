import type { Doc } from "../types";
import { terms } from "./terms";
import { privacy } from "./privacy";
import { cookies } from "./cookies";
import { acceptableUse } from "./acceptable-use";
import { communityGuidelines } from "./community-guidelines";
import { developerTerms } from "./developer-terms";
import { paidPlans } from "./paid-plans";
import { sponsorship } from "./sponsorship";
import { aiData } from "./ai-data";
import { subprocessors } from "./subprocessors";
import { security } from "./security";
import { legalNotice } from "./legal-notice";

/* Grouped as the /legal index shows them. */
export const LEGAL_GROUPS: { title: string; docs: Doc[] }[] = [
  { title: "Using Celpare", docs: [terms, privacy, cookies, acceptableUse, communityGuidelines] },
  { title: "Developers and business", docs: [developerTerms, paidPlans, sponsorship] },
  { title: "Trust", docs: [aiData, subprocessors, security, legalNotice] },
];

export const LEGAL_DOCS: Doc[] = LEGAL_GROUPS.flatMap((g) => g.docs);

export function legalDoc(slug: string): Doc | undefined {
  return LEGAL_DOCS.find((d) => d.slug === slug);
}

/* Bump when Terms or Privacy change in a way people must accept again. */
export const TERMS_VERSION = `terms-${terms.version}+privacy-${privacy.version}`;
