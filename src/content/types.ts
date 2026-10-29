/*
  One content model for the legal pages (/legal) and the product documentation
  (/help), phase LEGAL 2026-10-07. Plain data, so the same text renders the
  page, feeds /llms.txt for machine readers, and can be checked in tests (no em
  dashes, no unfilled placeholders on an indexed page).

  Inline text supports two markups only: [label](/path) for a link, and
  **text** for emphasis.
*/

export type Block =
  | string
  | { list: string[] }
  | { steps: string[] }
  | { table: { head: string[]; rows: string[][] } }
  | { note: string };

export type DocSection = {
  id: string;
  heading: string;
  blocks: Block[];
};

export type Change = { version: string; date: string; note: string };

export type Doc = {
  slug: string;
  title: string;
  /* One sentence, for the index, metadata and llms.txt. */
  description: string;
  version: string;
  /* ISO date the version takes effect. */
  effective: string;
  /* Plain language summary shown above the full text. */
  summary?: string[];
  sections: DocSection[];
  changes?: Change[];
};
