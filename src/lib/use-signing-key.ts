"use client";

import { useEffect, useState } from "react";
import { loadKey } from "./asc/keystore";

export type SigningKeySlot = "asc-signing-key" | "gp-signing-key";
export type SigningKeyStatus = "checking" | "present" | "missing";

/**
 * Store IDs live in localStorage, but the signing key is a non-extractable
 * CryptoKey in IndexedDB. Browsers can evict IndexedDB on their own, and a key
 * never travels to a new device, so the two can drift apart. Pages use this to
 * offer a one-file reconnect instead of failing every request.
 *
 * `watch` re-runs the check when it changes (e.g. after a reconnect).
 */
export function useSigningKey(
  slot: SigningKeySlot,
  enabled: boolean,
  watch?: unknown,
): SigningKeyStatus {
  const [result, setResult] = useState<{ watch: unknown; status: SigningKeyStatus } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void loadKey(slot).then((key) => {
      if (!cancelled) setResult({ watch, status: key ? "present" : "missing" });
    });
    return () => {
      cancelled = true;
    };
  }, [slot, enabled, watch]);

  if (!enabled) return "missing";
  if (!result || result.watch !== watch) return "checking";
  return result.status;
}
