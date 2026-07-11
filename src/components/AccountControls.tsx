"use client";

import { useEffect } from "react";
import { SignInButton, UserButton, useUser } from "@clerk/nextjs";
import { useAccount } from "@/lib/account";

const clerkEnabled = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

/**
 * Sign-in / avatar for the TopBar. Renders nothing until Clerk env keys
 * are configured, so local-only installs keep working.
 */
export function AccountControls() {
  if (!clerkEnabled) return null;
  return <AccountControlsInner />;
}

function AccountControlsInner() {
  const { isSignedIn, isLoaded } = useUser();
  const fetchMe = useAccount((s) => s.fetchMe);
  const reset = useAccount((s) => s.reset);

  useEffect(() => {
    if (!isLoaded) return;
    if (isSignedIn) fetchMe();
    else reset();
  }, [isLoaded, isSignedIn, fetchMe, reset]);

  if (!isLoaded) return null;

  if (!isSignedIn) {
    return (
      <SignInButton mode="modal">
        <button className="text-sm text-zinc-300 hover:text-emerald-400 transition">
          Sign in
        </button>
      </SignInButton>
    );
  }

  return (
    <UserButton appearance={{ elements: { avatarBox: "h-7 w-7" } }} />
  );
}
