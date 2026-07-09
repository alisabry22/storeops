"use client";

import { useEffect } from "react";
import { useCredentials } from "@/lib/store";
import { storePrivateKey } from "@/lib/asc/jwt";

/**
 * One-time migration for pre-keystore users: credentials persisted before
 * the non-extractable keystore contain the raw PEM in localStorage. Move it
 * into IndexedDB as a non-extractable CryptoKey and scrub the PEM.
 */
export function KeyMigrator() {
  const { credentials, setCredentials } = useCredentials();

  useEffect(() => {
    if (!credentials?.privateKeyPem) return;
    const { issuerId, keyId, privateKeyPem } = credentials;
    storePrivateKey(privateKeyPem)
      .then(() => setCredentials({ issuerId, keyId }))
      .catch(() => {
        // Import failed (corrupt PEM?) — leave as-is; connect flow will surface it
      });
  }, [credentials, setCredentials]);

  return null;
}
