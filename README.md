# StoreOps

**App Store Connect, without the clicking.**

Bulk-edit App Store metadata, pricing, and subscriptions across every storefront. Built for indie devs who ship to 50+ countries and are tired of the App Store Connect UI.

## Why

- Updating "What's New" in 40 locales takes an hour of clicking in ASC. Here it's one click.
- Adjusting prices for some countries but not others is a spreadsheet-and-prayer workflow. Here it's a matrix.
- Subscription pricing per territory is buried five screens deep. Here it's one table.

## Security model (read this first)

Your App Store Connect API key has write access to your whole account, so we designed around never having it:

1. Your `.p8` is imported as a **non-extractable WebCrypto key** (IndexedDB). The browser can sign with it but physically cannot export the key material — not even our own JavaScript, an XSS payload, or a browser extension can read it back. The PEM itself is never persisted anywhere.
2. JWTs are signed **locally in your browser** (ES256), valid for 20 minutes max. Only these short-lived tokens ever cross the wire — over TLS.
3. Requests go through a thin same-origin proxy (`/api/asc/*`) that exists only because Apple blocks CORS. It forwards your short-lived token verbatim, stores nothing, logs nothing.
4. Strict security headers (HSTS, nosniff, frame-ancestors none, no-referrer).
5. The code is right here — audit it.

## Getting started

```bash
npm install
npm run dev
```

Then open http://localhost:3000 and connect with your App Store Connect API key
(App Store Connect → Users and Access → Integrations → App Store Connect API — the **App Manager** role is enough).

## Status / Roadmap

- [x] Connect with ASC API key (browser-only key storage)
- [x] Apps list
- [x] Metadata bulk editor — description, keywords, promo text, What's New across all locales, "apply to all", char counters, per-locale save log
- [x] Pricing matrix — set base price, preview all ~175 territories (dry run), override individual countries, one-click apply (`appPriceSchedules`)
- [x] **Controlled pricing policy** — create a bounded, deterministic regional adjustment from current localized prices, snap to valid store price points, then review the diff before applying. StoreOps never lets an AI invent a production price.
- [x] **Subscription pricing** — list all subscriptions, import strict price sheets, snap to valid Apple subscription tiers, and explicitly request existing-subscriber preservation for eligible increases.
- [x] **Snapshots & corrective changes** — automatic snapshot before every apply; restore creates a new corrective schedule. Effective subscription decreases cannot be undone retroactively.
- [x] **Pro licensing (Lemon Squeezy)** — free tier: browse/preview/export; Pro: all writes. No accounts, no database — buy → license key → activate. Set `NEXT_PUBLIC_LS_CHECKOUT_URL` (see `.env.example`)
- [ ] MCP server — let AI agents drive StoreOps directly (list apps, read prices, apply sheets)
- [ ] App name / subtitle editing (`appInfoLocalizations`)
- [ ] Subscription pricing per territory (`subscriptionPrices`) with preserve-existing-subscribers handling
- [ ] Scheduled price changes (startDate support)
- [ ] Encrypt key at rest with a passphrase (AES-GCM)
- [ ] CSV / spreadsheet import-export for translations

## Stack

Next.js (App Router) · TypeScript · Tailwind · jose (JWT) · zustand
