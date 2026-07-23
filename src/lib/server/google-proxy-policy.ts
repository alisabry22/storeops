const EDITS_ROOT = /^androidpublisher\/v3\/applications\/[^/]+\/edits$/;
/**
 * Google requires a temporary edit even to read store listings. Creating an
 * empty edit does not change the live Play Store, so that narrowly-scoped
 * operation remains available to the preview tier. Deleting an edit stays
 * paid-only because an arbitrary edit ID could contain someone else's draft.
 */
export function isNonMutatingGoogleOperation(method: string, path: string): boolean {
  if (method === "GET") return true;

  if (method === "POST") {
    return (
      EDITS_ROOT.test(path) ||
      path.endsWith("/pricing:convertRegionPrices") ||
      path.endsWith("/oneTimeProducts:batchGet") ||
      path.endsWith("/subscriptions:batchGet")
    );
  }

  return false;
}
