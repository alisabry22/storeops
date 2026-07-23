import crypto from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  hasConfiguredLemonVariants,
  identifyLemonPlan,
  isInactiveLemonStatus,
  lemonEntitlementExternalId,
  verifyLemonSignature,
  verifyLemonSignatureWithRotation,
} from "./lemonsqueezy";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Lemon Squeezy entitlement policy", () => {
  it("maps only the configured yearly and lifetime variants", () => {
    vi.stubEnv("LEMONSQUEEZY_PRO_VARIANT_IDS", "1888145");
    vi.stubEnv("LEMONSQUEEZY_LIFETIME_VARIANT_IDS", "1892544");

    expect(identifyLemonPlan({ variant_id: 1888145 })).toBe("pro");
    expect(identifyLemonPlan({ variant_id: 1892544 })).toBe("lifetime");
    expect(identifyLemonPlan({ variant_id: 9999999 })).toBeNull();
    expect(hasConfiguredLemonVariants()).toBe(true);
  });

  it("does not grant StoreOps access to an unrelated legacy product", () => {
    expect(identifyLemonPlan({ product_name: "Another product" })).toBeNull();
    expect(identifyLemonPlan({ product_name: "StoreOps Pro" })).toBe("pro");
    expect(identifyLemonPlan({ product_name: "StoreOps Lifetime" })).toBe(
      "lifetime"
    );
  });

  it("verifies the exact raw webhook body with the signing secret", () => {
    const raw = JSON.stringify({ meta: { event_name: "subscription_created" } });
    const secret = "a sufficiently long webhook secret";
    const signature = crypto.createHmac("sha256", secret).update(raw).digest("hex");

    expect(verifyLemonSignature(raw, signature, secret)).toBe(true);
    expect(verifyLemonSignature(`${raw} `, signature, secret)).toBe(false);
  });

  it("accepts the previous webhook secret only during a planned rotation", () => {
    const raw = JSON.stringify({ meta: { event_name: "order_created" } });
    const previous = "previous webhook secret";
    const signature = crypto
      .createHmac("sha256", previous)
      .update(raw)
      .digest("hex");

    expect(
      verifyLemonSignatureWithRotation(
        raw,
        signature,
        "new webhook secret",
        previous
      )
    ).toBe(true);
    expect(
      verifyLemonSignatureWithRotation(raw, signature, "new webhook secret")
    ).toBe(false);
  });

  it("revokes ended or refunded access without cutting off grace and dunning states", () => {
    for (const status of ["expired", "refunded"]) {
      expect(isInactiveLemonStatus(status)).toBe(true);
    }
    for (const status of [
      "active",
      "on_trial",
      "past_due",
      "unpaid",
      "paused",
      "cancelled",
    ]) {
      expect(isInactiveLemonStatus(status)).toBe(false);
    }
  });

  it("namespaces external IDs by Lemon Squeezy resource type", () => {
    expect(lemonEntitlementExternalId("orders", "42")).toBe("orders:42");
    expect(lemonEntitlementExternalId("subscriptions", "42")).toBe(
      "subscriptions:42"
    );
  });
});
