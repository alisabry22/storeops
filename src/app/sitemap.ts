import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

const FEATURE_PAGES = [
  "/bulk-pricing",
  "/subscription-pricing",
  "/metadata-tool",
  "/localization",
  "/asc-api",
  "/asc-automation",
  "/csv-import",
  "/app-store-connect-pricing",
];

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    ...FEATURE_PAGES.map((path) => ({
      url: `${SITE_URL}${path}`,
      lastModified: new Date(),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];
}
