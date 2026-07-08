# StoreOps

**App Store Connect, without the clicking.**

Bulk-edit App Store metadata, pricing, and subscriptions across every storefront. Built for indie devs who ship to 50+ countries and are tired of the App Store Connect UI.

## Why

- Updating "What's New" in 40 locales takes an hour of clicking in ASC. Here it's one click.
- Adjusting prices for some countries but not others is a spreadsheet-and-prayer workflow. Here it's a matrix.
- Subscription pricing per territory is buried five screens deep. Here it's one table.

## Security model (read this first)

Your App Store Connect API key has write access to your whole account, so we designed around never having it:

1. Your `.p8` private key is stored **only in your browser** (localStorage).
2. JWTs are signed **locally in your browser** via WebCrypto (ES256), valid for 20 minutes max.
3. Requests go through a thin same-origin proxy (`/api/asc/*`) that exists only because Apple blocks CORS. It forwards your short-lived token verbatim, stores nothing, logs nothing.
4. The code is right here — audit it.

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
- [x] **AI pricing loop** — export current prices as CSV, copy a ready-made AI prompt with your data, paste the AI's repriced CSV back, prices snap to valid Apple price points, diff preview, one apply. Existing manual prices are preserved unless you say otherwise
- [ ] MCP server — let AI agents drive StoreOps directly (list apps, read prices, apply sheets)
- [ ] App name / subtitle editing (`appInfoLocalizations`)
- [ ] Subscription pricing per territory (`subscriptionPrices`) with preserve-existing-subscribers handling
- [ ] Scheduled price changes (startDate support)
- [ ] Encrypt key at rest with a passphrase (AES-GCM)
- [ ] CSV / spreadsheet import-export for translations

## Stack

Next.js (App Router) · TypeScript · Tailwind · jose (JWT) · zustand
