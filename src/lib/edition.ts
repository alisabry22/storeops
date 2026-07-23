export type StoreOpsEdition = "cloud" | "community";

export function editionFromEnvironment(value: string | undefined): StoreOpsEdition {
  return value === "community" ? "community" : "cloud";
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
