"use client";

import { useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import { useAccount } from "@/lib/account";
import { useLicense } from "@/lib/license";

/**
 * Mounted once in the root layout (when Clerk is configured). Keeps account
 * state in sync everywhere — homepage, /play, app pages — and bridges legacy
 * buyers: a device with an active Lemon Squeezy license signing into a free
 * account claims the key automatically, so Pro follows the account.
 */
export function AccountSync() {
  const { isSignedIn, isLoaded } = useUser();
  const plan = useAccount((s) => s.plan);
  const loaded = useAccount((s) => s.loaded);
  const fetchMe = useAccount((s) => s.fetchMe);
  const reset = useAccount((s) => s.reset);

  useEffect(() => {
    if (!isLoaded) return;
    if (isSignedIn) fetchMe();
    else reset();
  }, [isLoaded, isSignedIn, fetchMe, reset]);

  // Auto-claim: signed in + free account + active device license → attach key
  useEffect(() => {
    if (!isSignedIn || !loaded || plan !== "free") return;
    const { licenseKey, status } = useLicense.getState();
    if (status !== "active" || !licenseKey) return;
    fetch("/api/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ licenseKey }),
    })
      .then((res) => {
        if (res.ok) fetchMe();
      })
      .catch(() => {
        // best effort — device license still works locally
      });
  }, [isSignedIn, loaded, plan, fetchMe]);

  return null;
}
