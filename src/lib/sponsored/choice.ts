/*
  Which of a developer's tools can be chosen for sponsorship (founder,
  2026-10-09: choose the tool on the Sponsored page). Pure, so it is tested
  alone. The same gates the ranker applies at serve time (D205): the tool must
  be live in the catalogue, have a secure website, and not already have a
  sponsorship running. Payments are not open yet, so choosing changes nothing
  on the server; this decides what the picker offers and what it explains.
*/

export type ChoiceTool = {
  slug: string;
  name: string;
  logoUrl: string | null;
  status: string;
  websiteUrl: string | null;
};

export type ChoiceSponsorship = {
  status: string;
  endsAt: string | null;
  placementSuspendedAt: string | null;
};

export type SponsorChoice = ChoiceTool & {
  eligible: boolean;
  /* Why it cannot be chosen, in words for the developer. Null when eligible. */
  reason: string | null;
  /* ISO date a running sponsorship ends, for the "Sponsored until" line. */
  sponsoredUntil: string | null;
};

const STATUS_REASON: Record<string, string> = {
  draft: "Still a draft. Send it for review first.",
  pending: "In review. It can be sponsored once it is approved.",
  changes_required: "Changes were requested. Update it and send it back for review.",
  rejected: "Not approved, so it cannot be sponsored.",
};

export function sponsorChoice(
  tool: ChoiceTool,
  sponsorship: ChoiceSponsorship | null,
  now: Date = new Date(),
): SponsorChoice {
  const base = { ...tool, sponsoredUntil: null as string | null };
  if (tool.status !== "approved") {
    return { ...base, eligible: false, reason: STATUS_REASON[tool.status] ?? "Not live in the catalogue yet." };
  }
  if (!tool.websiteUrl || !/^https:\/\//i.test(tool.websiteUrl)) {
    return { ...base, eligible: false, reason: "Needs a secure website (https) on its listing." };
  }
  const running =
    sponsorship &&
    (sponsorship.status === "active" || sponsorship.status === "pending") &&
    (!sponsorship.endsAt || new Date(sponsorship.endsAt) > now);
  if (running) {
    if (sponsorship.placementSuspendedAt) {
      return { ...base, eligible: false, reason: "Its sponsored placement is paused by Celpare. Contact submission@celpare.com." };
    }
    return { ...base, eligible: false, reason: "Already sponsored.", sponsoredUntil: sponsorship.endsAt };
  }
  return { ...base, eligible: true, reason: null };
}

/* Eligible tools first, then the rest, each group in name order. */
export function sortChoices(choices: SponsorChoice[]): SponsorChoice[] {
  return [...choices].sort((a, b) => Number(b.eligible) - Number(a.eligible) || a.name.localeCompare(b.name));
}

/* The tool to start with: the one asked for if it can be chosen, else the first that can. */
export function initialChoice(choices: SponsorChoice[], wanted: string | null | undefined): string | null {
  const asked = wanted ? choices.find((c) => c.slug === wanted && c.eligible) : undefined;
  return asked?.slug ?? choices.find((c) => c.eligible)?.slug ?? null;
}
