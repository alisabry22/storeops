/**
 * Google Play credential + package store.
 * Only the service-account email and package names live in localStorage —
 * the private key is a non-extractable CryptoKey in IndexedDB (gp/auth.ts).
 */
"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { GpCredentials } from "./auth";
import { destroyGpKey } from "./auth";

interface GpState {
  gpCredentials: GpCredentials | null;
  /** Play has no list-apps endpoint — users register package names manually. */
  packages: string[];
  setGpCredentials: (creds: GpCredentials) => void;
  clearGpCredentials: () => void;
  addPackage: (pkg: string) => void;
  removePackage: (pkg: string) => void;
}

export const useGpStore = create<GpState>()(
  persist(
    (set) => ({
      gpCredentials: null,
      packages: [],
      setGpCredentials: (creds) => set({ gpCredentials: creds }),
      clearGpCredentials: () => {
        void destroyGpKey();
        set({ gpCredentials: null });
      },
      addPackage: (pkg) =>
        set((s) => ({
          packages: s.packages.includes(pkg)
            ? s.packages
            : [...s.packages, pkg],
        })),
      removePackage: (pkg) =>
        set((s) => ({ packages: s.packages.filter((p) => p !== pkg) })),
    }),
    { name: "storeops-gp" }
  )
);
