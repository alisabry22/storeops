export type StoreOpsEdition = "cloud" | "community";

export function editionFromEnvironment(value: string | undefined): StoreOpsEdition {
  return value === "community" ? "community" : "cloud";
}

/**
 * Paid entitlement checks are bypassed only by the Next.js development server.
 * Keep this tied to NODE_ENV rather than a public configuration value so a
 * production deployment cannot enable the bypass through client-visible env.
 */
export function isDevelopmentEnvironment(
  value: string | undefined = process.env.NODE_ENV,
): boolean {
  return value === "development";
}

/**
 * NEXT_PUBLIC values are fixed at build time. Community container images must
 * therefore be built with NEXT_PUBLIC_STOREOPS_EDITION=community.
 */
export const STOREOPS_EDITION = editionFromEnvironment(
  process.env.NEXT_PUBLIC_STOREOPS_EDITION,
);

export const isCommunityEdition = STOREOPS_EDITION === "community";
export const isCloudEdition = STOREOPS_EDITION === "cloud";
export const isDevelopmentSubscriptionBypass = isDevelopmentEnvironment();
