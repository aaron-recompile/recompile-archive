import type { MetadataRoute } from "next";
import { SITE_URL } from "./lib/server-api";

// Served at /robots.txt
//
// This corpus is written to be read by machines, so AI crawlers are allowed
// explicitly rather than left to the wildcard. The only disallowed paths are
// the write UI and the AI endpoints, which are interactive and have nothing
// to index.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: ["/articles/new", "/ai"] },
      { userAgent: "GPTBot", allow: "/" },
      { userAgent: "ClaudeBot", allow: "/" },
      { userAgent: "Claude-Web", allow: "/" },
      { userAgent: "PerplexityBot", allow: "/" },
      { userAgent: "CCBot", allow: "/" },
      { userAgent: "Google-Extended", allow: "/" },
      { userAgent: "Applebot-Extended", allow: "/" },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
