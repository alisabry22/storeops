/**
 * Account plan state — fetched once per session from /api/me when signed in.
 * Pro can come from the account (SaaS path) or a legacy device license;
 * useIsPro() in license.ts combines both.
 */
"use client";

import { create } from "zustand";

export type AccountPlan = "free" | "pro" | "lifetime";

interface AccountState {
  plan: AccountPlan | null;
  email: string | null;
  loaded: boolean;
  fetchMe: () => Promise<void>;
  reset: () => void;
}

export const useAccount = create<AccountState>((set, get) => ({
  plan: null,
  email: null,
  loaded: false,

  fetchMe: async () => {
    if (get().loaded) return;
    try {
      const res = await fetch("/api/me");
      if (res.ok) {
        const json: { plan: AccountPlan; email: string | null } = await res.json();
        set({ plan: json.plan, email: json.email, loaded: true });
      }
    } catch {
      // offline / not configured — stay unloaded, retry next mount
    }
  },

  reset: () => set({ plan: null, email: null, loaded: false }),
}));
