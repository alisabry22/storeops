/**
 * Client-side credential store.
 * Only issuerId + keyId live in localStorage. The private key itself is a
 * non-extractable CryptoKey in IndexedDB (see asc/keystore.ts) — it cannot
 * be read back, only signed with.
 */
"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AscCredentials } from "./asc/jwt";
import { destroyPrivateKey } from "./asc/jwt";

interface CredentialState {
  credentials: AscCredentials | null;
  setCredentials: (creds: AscCredentials) => void;
  clearCredentials: () => void;
}

export const useCredentials = create<CredentialState>()(
  persist(
    (set) => ({
      credentials: null,
      setCredentials: (creds) => set({ credentials: creds }),
      clearCredentials: () => {
        void destroyPrivateKey();
        set({ credentials: null });
      },
    }),
    { name: "storeops-credentials" }
  )
);
