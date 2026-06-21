import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/site-url";

/**
 * robots.txt. Allow crawling of marketing pages; disallow the authenticated
 * app surface, API routes, and the payment-proof page (contains
 * transaction-specific content not meant for indexing).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/app/", "/api/", "/payment-proof"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
