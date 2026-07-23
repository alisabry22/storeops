/**
 * Lemon Squeezy licensing — no accounts, no database.
 * Buy → get a license key → paste it here → activated against LS.
 * Free tier: connect, browse, preview, export. Pro: every write to Apple.
 */
"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useAccount } from "./account";
import { withCheckoutIdentity } from "./checkout";
import { isCommunityEdition } from "./edition";

export const CHECKOUT_URL =
  process.env.NEXT_PUBLIC_LS_CHECKOUT_URL ??
  "https://storeops.lemonsqueezy.com/checkout"; // set the real one in .env

// Lifetime deal: create a one-time-purchase product in Lemon Squeezy and set
// NEXT_PUBLIC_LS_LIFETIME_CHECKOUT_URL. Until then, the UI shows yearly only —
// never advertise a product that can't be bought.
export const LIFETIME_CHECKOUT_URL =
  process.env.NEXT_PUBLIC_LS_LIFETIME_CHECKOUT_URL ?? "";
export const LIFETIME_PRICE = process.env.NEXT_PUBLIC_LIFETIME_PRICE ?? "$79";
export const LIFETIME_FULL_PRICE = process.env.NEXT_PUBLIC_LIFETIME_FULL_PRICE ?? "$129";
export const YEARLY_PRICE = process.env.NEXT_PUBLIC_YEARLY_PRICE ?? "$49.99";

interface LicenseState {
  licenseKey: string | null;
  instanceId: string | null;
  productName: string | null;
  status: "none" | "active" | "invalid";
  /** ISO date of last successful validation */
  lastValidated: string | null;
  /** Short-lived server-signed proof used to authorize store writes. */
  writeToken: string | null;
  writeTokenExpiresAt: string | null;
  activate: (key: string) => Promise<{ ok: boolean; error?: string }>;
  revalidate: () => Promise<void>;
  deactivate: () => Promise<void>;
}

async function lsCall(body: Record<string, string>): Promise<{
  ok: boolean;
  json: {
    activated?: boolean;
    valid?: boolean;
    error?: string;
    instance?: { id: string };
    meta?: { product_name?: string };
    write_token?: string;
    write_token_expires_at?: string;
  };
}> {
  const res = await fetch("/api/license", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let json = {};
  try {
    json = await res.json();
  } catch {
    // non-JSON upstream error
  }
  return { ok: res.ok, json };
}

export const useLicense = create<LicenseState>()(
  persist(
    (set, get) => ({
      licenseKey: null,
      instanceId: null,
      productName: null,
      status: "none",
      lastValidated: null,
      writeToken: null,
      writeTokenExpiresAt: null,

      activate: async (key: string) => {
        const trimmed = key.trim();
        if (!trimmed) return { ok: false, error: "Enter your license key." };
        try {
          const { json } = await lsCall({
            action: "activate",
            license_key: trimmed,
            instance_name: "StoreOps",
          });
          if (json.activated && json.instance?.id) {
            set({
              licenseKey: trimmed,
              instanceId: json.instance.id,
              productName: json.meta?.product_name ?? "StoreOps Pro",
              status: "active",
              lastValidated: new Date().toISOString(),
              writeToken: json.write_token ?? null,
              writeTokenExpiresAt: json.write_token_expires_at ?? null,
            });
            return { ok: true };
          }
          return {
            ok: false,
            error: json.error ?? "Activation failed — check the key and try again.",
          };
        } catch {
          return { ok: false, error: "Network error — try again." };
        }
      },

      revalidate: async () => {
        const {
          licenseKey,
          instanceId,
          lastValidated,
          writeToken,
          writeTokenExpiresAt,
        } = get();
        if (!licenseKey || !instanceId) return;
        // At most once a day; stay quiet otherwise
        if (
          writeToken &&
          writeTokenExpiresAt &&
          new Date(writeTokenExpiresAt).getTime() - Date.now() > 5 * 60 * 1000 &&
          lastValidated &&
          Date.now() - new Date(lastValidated).getTime() < 24 * 60 * 60 * 1000
        )
          return;
        try {
          const { json } = await lsCall({
            action: "validate",
            license_key: licenseKey,
            instance_id: instanceId,
          });
          if (json.valid === true) {
            set({
              status: "active",
              lastValidated: new Date().toISOString(),
              writeToken: json.write_token ?? null,
              writeTokenExpiresAt: json.write_token_expires_at ?? null,
            });
          } else if (json.valid === false) {
            set({ status: "invalid" });
          }
          // network / LS hiccups: keep current status — never punish offline
        } catch {
          // offline — keep current status
        }
      },

      deactivate: async () => {
        const { licenseKey, instanceId } = get();
        if (licenseKey && instanceId) {
          try {
            await lsCall({
              action: "deactivate",
              license_key: licenseKey,
              instance_id: instanceId,
            });
          } catch {
            // best effort
          }
        }
        set({
          licenseKey: null,
          instanceId: null,
          productName: null,
          status: "none",
          lastValidated: null,
          writeToken: null,
          writeTokenExpiresAt: null,
        });
      },
    }),
    { name: "storeops-license" }
  )
);

/**
 * Prefill the Lemon Squeezy checkout with the signed-in user's email so the
 * purchase webhook can match it to the account — no license key entry needed.
 */
export function withCheckoutEmail(url: string, email: string | null): string {
  return withCheckoutIdentity(url, email, null);
}

export function useCheckoutUrls(): { yearly: string; lifetime: string } {
  const email = useAccount((s) => s.email);
  const userId = useAccount((s) => s.userId);
  return {
    yearly: withCheckoutIdentity(CHECKOUT_URL, email, userId),
    lifetime: withCheckoutIdentity(LIFETIME_CHECKOUT_URL, email, userId),
  };
}

export function useIsPro(): boolean {
  // Pro from either source: account plan (SaaS) or device license (legacy)
  const deviceLicense = useLicense((s) => s.status === "active");
  const accountPro = useAccount((s) => s.plan === "pro" || s.plan === "lifetime");
  return isCommunityEdition || deviceLicense || accountPro;
}

/**
 * Existing paid license users are transparently revalidated once when they
 * first write after upgrading to server-side authorization.
 */
export async function getLegacyWriteHeaders(): Promise<Record<string, string>> {
  let state = useLicense.getState();
  if (state.status !== "active") return {};
  const expiresSoon =
    !state.writeTokenExpiresAt ||
    new Date(state.writeTokenExpiresAt).getTime() - Date.now() < 5 * 60 * 1000;
  if (!state.writeToken || expiresSoon) {
    await state.revalidate();
    state = useLicense.getState();
  }
  return state.writeToken
    ? { "X-StoreOps-License-Proof": state.writeToken }
    : {};
}
