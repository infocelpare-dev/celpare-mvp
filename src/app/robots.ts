import type { MetadataRoute } from "next";
import { OPERATOR } from "@/content/operator";

/*
  Crawlers may read the public site; private and signed in areas are not for
  them (phase LEGAL).

  Usage audit, 2026-11-18: every search, compare and filter URL is a fresh
  server render, and their query strings make an endless set of addresses.
  Crawlers get the pages themselves (profiles, /explore, help, legal) but not:
    - any address with a query string ("/*?"), which covers filters, ?debug,
      ?ref and every compare or search combination (the plain /search and
      /compare pages stay crawlable: they are single addresses and in the
      sitemap),
    - /anon/, the cached copies of profiles, which visitors never see by that
      name (src/proxy.ts) and whose canonical URL is the profile itself.

  Scrapers that only collect training data and send no visitors are refused
  outright. Assistants that answer people's questions with a link (ChatGPT
  search, Claude, Perplexity) and Google stay allowed, because being
  recommended by them is the point of Celpare. robots.txt is a request, not a
  wall: a scraper that ignores it is stopped by Cloudflare's bot settings.
*/
const TRAINING_ONLY_SCRAPERS = [
  "Bytespider",
  "CCBot",
  "meta-externalagent",
  "Diffbot",
  "ImagesiftBot",
  "Omgilibot",
  "omgili",
  "Timpibot",
  "PetalBot",
  "MJ12bot",
  "DotBot",
  "BLEXBot",
  "DataForSeoBot",
];

export default function robots(): MetadataRoute.Robots {
  const site = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || OPERATOR.site;
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/admin",
          "/settings",
          "/messages",
          "/notifications",
          "/developer",
          "/auth/",
          "/plans",
          "/welcome",
          "/anon/",
          "/*?",
        ],
      },
      { userAgent: TRAINING_ONLY_SCRAPERS, disallow: "/" },
    ],
    sitemap: `${site}/sitemap.xml`,
  };
}
