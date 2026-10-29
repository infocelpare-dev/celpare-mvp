import type { Doc } from "../types";
import { OPERATOR } from "../operator";

/* Legal notice, version 1.0 (phase LEGAL, 2026-10-07). Who operates Celpare and how to reach it. */

export const legalNotice: Doc = {
  slug: "legal-notice",
  title: "Legal notice",
  description: "Who operates Celpare, where, and how to contact it.",
  version: "1.0",
  effective: "2026-10-07",
  sections: [
    {
      id: "operator",
      heading: "1. Operator",
      blocks: [
        {
          table: {
            head: ["Item", "Details"],
            rows: [
              ["Service", `${OPERATOR.brand}, ${OPERATOR.site}`],
              ["Operated by", OPERATOR.legalName],
              ["Address", OPERATOR.address],
              ["Country", OPERATOR.country],
              ["Company registration", "Not yet registered. This page will show the registered name and number once it is."],
            ],
          },
        },
      ],
    },
    {
      id: "contact",
      heading: "2. Contact",
      blocks: [
        {
          table: {
            head: ["For", "Email"],
            rows: [
              ["General questions and appeals", `[${OPERATOR.contact}](mailto:${OPERATOR.contact})`],
              ["Privacy and data requests", `[${OPERATOR.privacy}](mailto:${OPERATOR.privacy})`],
              ["Security vulnerabilities", `[${OPERATOR.security}](mailto:${OPERATOR.security})`],
              ["Reporting content or rights infringement", `[${OPERATOR.reports}](mailto:${OPERATOR.reports})`],
              ["Tool listings, developers and sponsorship", `[${OPERATOR.submissions}](mailto:${OPERATOR.submissions})`],
            ],
          },
        },
      ],
    },
  ],
};
