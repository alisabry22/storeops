import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { KeyMigrator } from "@/components/KeyMigrator";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "StoreOps — App Store Connect, without the clicking",
  description:
    "Bulk-edit metadata, pricing, and subscriptions across every storefront. Built for indie devs.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-zinc-950 text-zinc-100" suppressHydrationWarning>
        <KeyMigrator />
        {children}
      </body>
    </html>
  );
}
