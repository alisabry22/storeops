/** Narrow upstream path policies for the token-forwarding store proxies. */

export function isAllowedAscPath(method: string, path: string[]): boolean {
  if (path[0] === "v1") return true;
  if (method !== "GET" || path[0] !== "v2") return false;
  return (
    path.length === 4 &&
    path[1] === "inAppPurchases" &&
    (path[3] === "pricePoints" || path[3] === "iapPriceSchedule")
  );
}
