/*
  Who operates Celpare, in one place (phase LEGAL, 2026-10-07).

  Founder: Celpare, Kenya, not yet registered with the Business Registration
  Service. The legal name and postal address are placeholders until the founder
  fills them; while any placeholder remains, every legal page is noindex
  (see PLACEHOLDERS_OPEN). When Celpare is registered, the registered name and
  number replace the founder's name here, and every page picks it up.
*/

export const OPERATOR = {
  brand: "Celpare",
  legalName: "[FOUNDER LEGAL NAME]",
  address: "[POSTAL ADDRESS]",
  country: "Kenya",
  site: "https://celpare.com",
  contact: "info@celpare.com",
  /* No privacy@ alias exists yet; info@ is received (Forward Email). */
  privacy: "info@celpare.com",
  security: "info@celpare.com",
  reports: "reports@celpare.com",
  submissions: "submission@celpare.com",
} as const;

export const PLACEHOLDER = /\[[A-Z][A-Z ]+\]/;

export const PLACEHOLDERS_OPEN = Object.values(OPERATOR).some((v) => PLACEHOLDER.test(v));

/* "Celpare, operated by <name> in Kenya" */
export const OPERATED_BY = `${OPERATOR.brand}, operated by ${OPERATOR.legalName}, ${OPERATOR.country}`;
