"use client";

import Link from "next/link";
import { SignInButton, SignUpButton, useUser } from "@clerk/nextjs";
import { isCommunityEdition } from "@/lib/edition";
import { PageSkeleton } from "./PageSkeleton";

const clerkEnabled =
  !isCommunityEdition && !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

/**
 * Gates store-connection surfaces behind a (free) account. Email capture
 * happens before any credential is entered — accounts also carry the plan,
 * synced snapshots, and lifecycle email consent. Local installs without
 * Clerk env keys render children directly.
 */
export function RequireAccount({ children }: { children: React.ReactNode }) {
  if (!clerkEnabled) return <>{children}</>;
  return <Gate>{children}</Gate>;
}

function Gate({ children }: { children: React.ReactNode }) {
  const { isSignedIn, isLoaded } = useUser();

  if (!isLoaded) return <PageSkeleton />;
  if (isSignedIn) return <>{children}</>;

  return (
    <div className="max-w-md mx-auto px-6 py-20 text-center">
      <div className="card card-hero p-8">
        <h1 className="text-2xl font-bold tracking-tight mb-2">
          Create your free account
        </h1>
        <p className="text-sm text-zinc-400 leading-relaxed mb-6">
          One free account for both stores. Your price backups and Pro plan
          follow you to any device. Store keys stay in your browser and are
          never sent to us.
        </p>
        <SignUpButton mode="modal">
          <button className="btn-glow min-h-11 w-full rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 transition">
            Sign up free — takes 20 seconds
          </button>
        </SignUpButton>
        <p className="mt-4 text-sm text-zinc-400">
          Already have an account?{" "}
          <SignInButton mode="modal">
            <button className="min-h-8 font-medium text-emerald-400 hover:text-emerald-300">
              Sign in
            </button>
          </SignInButton>
        </p>
        <ul className="mt-6 space-y-1.5 text-xs text-zinc-400 border-t border-zinc-800 pt-5 text-left">
          <li>✓ Free forever — browse, preview, export</li>
          <li>✓ No credit card required</li>
          <li>✓ Price backups synced across devices</li>
        </ul>
        <p className="mt-5 text-[11px] text-zinc-600">
          By signing up you agree to the{" "}
          <Link href="/terms" className="text-zinc-500 hover:text-zinc-300">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="text-zinc-500 hover:text-zinc-300">
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
