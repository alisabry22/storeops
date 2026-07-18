import { describe, expect, it } from "vitest";
import { withCheckoutIdentity } from "./checkout";

describe("checkout identity", () => {
  it("prefills email and passes the signed-in account ID as custom data", () => {
    const result = new URL(
      withCheckoutIdentity(
        "https://example.lemonsqueezy.com/checkout/buy/variant",
        "buyer@example.com",
        "user_123"
      )
    );

    expect(result.searchParams.get("checkout[email]")).toBe("buyer@example.com");
    expect(result.searchParams.get("checkout[custom][user_id]")).toBe("user_123");
  });
});
