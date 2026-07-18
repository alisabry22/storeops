/** Attach account identity without exposing anything beyond the checkout URL. */
export function withCheckoutIdentity(
  checkoutUrl: string,
  email: string | null,
  userId: string | null
): string {
  if (!checkoutUrl || (!email && !userId)) return checkoutUrl;
  const url = new URL(checkoutUrl);
  if (email) url.searchParams.set("checkout[email]", email);
  if (userId) url.searchParams.set("checkout[custom][user_id]", userId);
  return url.toString();
}
