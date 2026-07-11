"use client";

import { SignInButton, UserButton, useUser } from "@clerk/nextjs";

const clerkEnabled = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

/**
 * Sign-in / avatar for the TopBar. Purely presentational — account state
 * syncing lives in <AccountSync /> in the root layout. Renders nothing until
 * Clerk env keys are configured, so local-only installs keep working.
 */
export function AccountControls() {
  if (!clerkEnabled) return null;
  return <AccountControlsInner />;
}

function AccountControlsInner() {
  const { isSignedIn, isLoaded } = useUser();

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

  return <UserButton appearance={{ elements: { avatarBox: "h-7 w-7" } }} />;
}
