import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // App pages are credential-gated shells; APIs are not content
      disallow: ["/apps", "/api/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
