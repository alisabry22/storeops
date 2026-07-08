/**
 * Client-side credential store.
 * Credentials live in localStorage on the user's machine only.
 * (Roadmap: encrypt at rest with a passphrase via WebCrypto AES-GCM.)
 */
"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AscCredentials } from "./asc/jwt";
import { clearTokenCache } from "./asc/jwt";

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
        clearTokenCache();
        set({ credentials: null });
      },
    }),
    { name: "storeops-credentials" }
  )
);
