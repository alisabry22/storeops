# StoreOps

**Finish App Store and Google Play operations without losing the afternoon.**

StoreOps is a cross-store control room for regional pricing, subscriptions,
in-app products, App Store metadata, and recoverable pricing history.

## Product contract

- Connect and inspect both stores for free.
- Build a worldwide grid from an official store anchor or adjust current prices
  through a bounded, deterministic policy.
- Review every change as a current-versus-proposed diff.
- Confirm a complete browser restore point—and its account copy when accounts
  are enabled—before every pricing mutation.
- Apply only with a server-verified Pro or Lifetime entitlement.
- Enforce the movement cap against the final Apple price point or
  Google-approved amount immediately before the write.
- Re-read Apple and Google Play after a successful write and refuse to report
  completion if the live values do not match.

AI is limited to translating a developer's goal into a policy and movement cap.
It never generates the production price sheet.

## Store behavior

- **Apple:** targets snap to official price points. Subscription preservation is
  explicitly requested only for eligible increases. Effective changes are
  corrected through the schedules Apple permits; completed billing is not
  reversible.
- **Google Play:** current storefront grids can be restored from any retained
  snapshot. Subscription legacy cohorts remain separate from the current price
  used for new purchases.

## Credential model

Apple `.p8` and Google service-account keys are imported as non-extractable
WebCrypto keys in IndexedDB. Their raw material is not uploaded to StoreOps.
Short-lived store tokens pass through narrow same-origin proxies because the
store APIs block browser CORS.

Non-extractable does not mean page compromise is harmless: code executing in
the application context could request signatures. CSP, dependency hygiene,
least-privilege store roles, and revocable keys remain part of the threat model.

## Paid-write authorization

- Clerk account plans are checked on the server for every store mutation.
- Legacy Lemon Squeezy license customers receive a signed 24-hour write proof
  after license validation, so existing buyers continue to work without an API
  validation for every territory.
- Read operations and Google `convertRegionPrices` previews stay available to
  free users.

## Local development

```bash
npm install
npm run dev
```

Copy `.env.example` and configure Clerk, Neon, Lemon Squeezy, and store checkout
URLs as needed. The Clerk publishable and secret keys must come from the same
instance and environment. For an explicitly unlicensed local install only, set:

```bash
STOREOPS_ALLOW_UNLICENSED_WRITES=true
```

Never enable that flag in production.

## Launch checklist

Set production environment variables in the deployment platform, then run:

```bash
npm run launch:check
npm test
npm run lint
npm run build
```

In Lemon Squeezy, send production webhooks to
`https://www.storeops.dev/api/webhooks/lemonsqueezy` and use the same signing
secret as `LEMONSQUEEZY_WEBHOOK_SECRET`. Enable `order_created`,
`order_refunded`, `subscription_created`, `subscription_updated`,
`subscription_cancelled`, `subscription_resumed`, and
`subscription_expired`, `subscription_paused`, and `subscription_unpaused`.
Apply the database migrations before accepting the first purchase.

## Database

```bash
npm run db:generate
npm run db:push
```

The database contains account plans, billing entitlements, usage events, and
pricing snapshots. Store credentials are not stored in the database.

## Quality gates

```bash
npm test
npm run lint
npm run build
```

## Stack

Next.js · React · TypeScript · Tailwind CSS · Clerk · Neon/Drizzle · Lemon
Squeezy · WebCrypto · Vitest
