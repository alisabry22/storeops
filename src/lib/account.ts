/**
 * Account plan state — fetched once per session from /api/me when signed in.
 * Pro can come from the account (SaaS path) or a legacy device license;
 * useIsPro() in license.ts combines both.
 */
"use client";

import { create } from "zustand";

export type AccountPlan = "free" | "pro" | "lifetime";

interface AccountState {
  userId: string | null;
  plan: AccountPlan | null;
  email: string | null;
  loaded: boolean;
  fetchMe: (force?: boolean) => Promise<void>;
  reset: () => void;
}

export const useAccount = create<AccountState>((set, get) => ({
  userId: null,
  plan: null,
  email: null,
  loaded: false,

  fetchMe: async (force = false) => {
    if (get().loaded && !force) return;
    try {
      const res = await fetch("/api/me");
      if (res.ok) {
        const json: {
          userId: string;
          plan: AccountPlan;
          email: string | null;
        } = await res.json();
        set({
          userId: json.userId,
          plan: json.plan,
          email: json.email,
          loaded: true,
        });
      }
    } catch {
      // offline / not configured — stay unloaded, retry next mount
    }
  },

  reset: () =>
    set({ userId: null, plan: null, email: null, loaded: false }),
}));
