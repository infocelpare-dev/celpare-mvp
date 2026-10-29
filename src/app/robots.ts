import type { MetadataRoute } from "next";
import { OPERATOR } from "@/content/operator";

/* Crawlers may read the public site; private and signed in areas are not for them (phase LEGAL). */
export default function robots(): MetadataRoute.Robots {
  const site = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || OPERATOR.site;
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/admin", "/settings", "/messages", "/notifications", "/developer", "/auth/"],
      },
    ],
    sitemap: `${site}/sitemap.xml`,
  };
}
