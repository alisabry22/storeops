import type { GpListing } from "./types";

export const GP_LISTING_FIELDS = [
  { key: "title", label: "App title", limit: 30, rows: 1 },
  { key: "shortDescription", label: "Short description", limit: 80, rows: 2 },
  { key: "fullDescription", label: "Full description", limit: 4000, rows: 8 },
  { key: "video", label: "Promo video URL", limit: null, rows: 1 },
] as const;

export type GpListingField = (typeof GP_LISTING_FIELDS)[number]["key"];
export type GpListingDraft = Record<string, Partial<Record<GpListingField, string>>>;

export function listingValue(listing: GpListing, field: GpListingField): string {
  return listing[field] ?? "";
}

export function changedListingFields(
  listing: GpListing,
  draft: Partial<Record<GpListingField, string>>,
): Partial<Record<GpListingField, string>> {
  const changed: Partial<Record<GpListingField, string>> = {};
  for (const field of GP_LISTING_FIELDS) {
    const value = draft[field.key];
    if (value !== undefined && value !== listingValue(listing, field.key)) {
      changed[field.key] = value;
    }
  }
  return changed;
}

export function validateListingFields(
  values: Partial<Record<GpListingField, string>>,
): string[] {
  const errors: string[] = [];
  for (const field of GP_LISTING_FIELDS) {
    const value = values[field.key];
    if (value !== undefined && field.limit !== null && value.length > field.limit) {
      errors.push(`${field.label} is ${value.length}/${field.limit} characters.`);
    }
  }
  return errors;
}

export function findListingMismatches(
  expected: GpListing[],
  actual: GpListing[],
): string[] {
  const actualByLanguage = new Map(actual.map((listing) => [listing.language, listing]));
  const mismatches: string[] = [];
  for (const listing of expected) {
    const found = actualByLanguage.get(listing.language);
    if (!found) {
      mismatches.push(`${listing.language}: listing was not returned after commit`);
      continue;
    }
    for (const field of GP_LISTING_FIELDS) {
      if (listingValue(found, field.key) !== listingValue(listing, field.key)) {
        mismatches.push(`${listing.language}: ${field.label} did not match after commit`);
      }
    }
  }
  return mismatches;
}
