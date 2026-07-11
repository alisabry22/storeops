import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { Analytics } from "@vercel/analytics/next";
import { AccountSync } from "@/components/AccountSync";
import { KeyMigrator } from "@/components/KeyMigrator";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, SITE_URL } from "@/lib/site";
import "./globals.css";

// Accounts are opt-in by env: without Clerk keys the app runs local-only.
const clerkEnabled = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: `%s — ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: [
    "app store connect bulk edit",
    "app store pricing tool",
    "bulk update app store metadata",
    "app store connect api tool",
    "subscription pricing per country",
    "indie ios developer tools",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  robots: { index: true, follow: true },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: SITE_NAME,
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Web",
  description: SITE_DESCRIPTION,
  url: SITE_URL,
  offers: [
    {
      "@type": "Offer",
      name: "Free",
      price: "0",
      priceCurrency: "USD",
    },
    {
      "@type": "Offer",
      name: "Pro",
      price: "49.99",
      priceCurrency: "USD",
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const content = (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-zinc-950 text-zinc-100" suppressHydrationWarning>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <KeyMigrator />
        {clerkEnabled && <AccountSync />}
        {children}
        <Analytics />
      </body>
    </html>
  );

  if (!clerkEnabled) return content;

  return (
    <ClerkProvider
      appearance={{
        variables: {
          colorPrimary: "#10b981",
          colorBackground: "#18181b",
          colorForeground: "#f4f4f5",
          colorNeutral: "#52525b",
          colorInput: "#09090b",
          colorInputForeground: "#f4f4f5",
          colorDanger: "#f87171",
          borderRadius: "0.5rem",
          fontFamily: "var(--font-geist-sans)",
          fontFamilyButtons: "var(--font-geist-sans)",
        },
        elements: {
          card: "bg-zinc-900 border border-zinc-800 shadow-2xl",
          headerTitle: "text-zinc-100 font-semibold",
          headerSubtitle: "text-zinc-400",
          socialButtonsBlockButton:
            "bg-zinc-800 border border-zinc-700 text-zinc-200 hover:bg-zinc-700",
          socialButtonsBlockButtonText: "text-zinc-200 font-medium",
          socialButtonsBlockButtonArrow: "text-zinc-500",
          dividerLine: "bg-zinc-800",
          dividerText: "text-zinc-500 text-xs",
          formFieldLabel: "text-zinc-300 text-sm",
          formFieldInput:
            "bg-zinc-950 border-zinc-700 text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-500",
          formButtonPrimary:
            "bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold shadow-none",
          footerActionLink: "text-emerald-400 hover:text-emerald-300",
          footerActionText: "text-zinc-500",
          identityPreviewText: "text-zinc-300",
          identityPreviewEditButton: "text-emerald-400 hover:text-emerald-300",
          formFieldInputShowPasswordButton: "text-zinc-500 hover:text-zinc-300",
          otpCodeFieldInput:
            "bg-zinc-950 border-zinc-700 text-zinc-100",
          alertText: "text-zinc-300",
          navbarButton: "text-zinc-300 hover:text-zinc-100",
        },
      }}
    >
      {content}
    </ClerkProvider>
  );
}
