# StoreOps

**Open-source operations for App Store Connect and Google Play.**

[![CI](https://github.com/alisabry22/storeops/actions/workflows/ci.yml/badge.svg)](https://github.com/alisabry22/storeops/actions/workflows/ci.yml)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)
[![StoreOps Cloud](https://img.shields.io/badge/cloud-storeops.dev-10b981)](https://www.storeops.dev)

StoreOps gives shipping teams one place to preview, apply, verify, and recover
regional pricing and release metadata without repeating the same operation in
hundreds of storefronts.

It is available in two forms:

- **StoreOps Community:** free, self-hosted, and developer-controlled.
- **StoreOps Cloud:** the hosted service with account-backed synchronization,
  managed upgrades, billing, and maintainer support.

The core store-operation features are available in the Community Edition. Cloud
revenue funds maintenance and continued open-source development.

## What it does

- Connects App Store Connect and Google Play using developer-provided keys.
- Loads subscriptions, in-app products, and regional prices.
- Prices monthly and yearly subscriptions together, with a worldwide comparison
  of both plans, annual savings, and selectable countries before applying.
- Builds deterministic worldwide pricing previews from official store data.
- Enforces a maximum movement cap immediately before a pricing write.
- Saves a complete pricing snapshot before applying.
- Re-reads the store after a write and reports success only when values match.
- Edits localized App Store and Google Play listing metadata.
- Prepares localized Google Play “What’s new” notes in Play Console format.
- Imports and exports auditable CSV price sheets.

AI is optional and limited to selecting a pricing strategy and movement cap. It
never generates the final production territory price grid.

### Price plans together

In an App Store app's **Subscriptions** page or the **Google Play** workspace,
choose **Price plans together**, select monthly and yearly plans with equivalent
access, and load their USA
reference prices. Choose an existing market policy and either keep the USA
annual discount, set a target discount, or localize the two anchors independently.
The preview shows current and proposed local prices for both plans, the yearly
monthly equivalent, and actual savings after store-tier rounding.

Choose the countries to apply or export the comparison as CSV. Existing prices
are staged within the selected movement cap unless you explicitly choose the
full target. StoreOps checks for changes since preview and saves both recovery
snapshots before applying. Apple processes each price separately; results show
verification for each plan and any partial failure. Google Play uses declared
monthly/yearly base-plan billing periods and Google's approved regional prices;
base plans in the same product are updated in one request, while different
products can partially succeed. Google changes affect new buyers only and never
migrate existing subscriber cohorts. Backups remain available in each plan's
individual view. Store-specific limitations are explicit; new user-facing
features must cover both stores.

## Run Community Edition

### Docker

```bash
git clone https://github.com/alisabry22/storeops.git
cd storeops
docker compose up --build -d
```

Open [http://localhost:3000](http://localhost:3000).

### Node.js

Node.js 24 LTS is required; use 24.22.2 or a newer patched 24.x release.

```bash
git clone https://github.com/alisabry22/storeops.git
cd storeops
npm ci
cp community.env.example .env.local
npm run dev
```

Community mode needs no Clerk project, database, or Lemon Squeezy account. See
[the self-hosting guide](docs/SELF_HOSTING.md) before exposing it publicly.
The selected edition appears in the app header. Cloud requires a StoreOps
account for synced backups and a paid plan for production store writes; your
own Community installation requires neither. If you already have a `.env.local`,
set `NEXT_PUBLIC_STOREOPS_EDITION=community` there and restart the server.

## Safety model

Every high-impact workflow follows the same contract:

1. Read the current store state.
2. Build a current-versus-proposed preview.
3. Enforce deterministic policy and movement limits.
4. Save a complete browser recovery point before pricing mutations.
5. Apply only after explicit confirmation.
6. Read the store again and verify the accepted values.

Apple `.p8` and Google service-account keys are imported as non-extractable
WebCrypto keys in IndexedDB. Raw private-key material is not intentionally
uploaded. Short-lived store tokens traverse a narrow same-origin proxy because
the store APIs block browser CORS.

“Non-extractable” does not protect against malicious code already executing in
the page. Community operators must protect the host, dependency chain, browser,
TLS termination, and request logs. Use revocable, least-privilege store roles.

## Store behavior

- **Apple:** targets snap to official price points. Subscription preservation is
  requested only for eligible increases. Corrective changes follow the
  schedules Apple permits; completed billing is not reversible.
- **Google Play:** current storefront grids can be restored from retained
  snapshots. Subscription legacy cohorts remain separate from pricing for new
  purchasers. Metadata writes use a fresh Edit, validation, protected commit,
  and post-commit verification.

### Provider terms

StoreOps is independent software and is not endorsed by Apple or Google.
Operators are responsible for their agreements, permissions, review rules, and
API use. Google’s
[Developer API usage instructions](https://developers.google.com/android-publisher/api_usage)
include restrictions on third-party publishing services and credential sharing.
Self-hosting does not waive those terms or constitute Google approval.

## Community and Cloud configuration

`NEXT_PUBLIC_STOREOPS_EDITION` is a build-time value:

| Value | Behavior |
| --- | --- |
| `community` | Core writes unlocked; no account, billing, or database required |
| unset / `cloud` | Clerk accounts and server-verified paid write entitlement |

Do not enable Community mode in the hosted StoreOps Cloud deployment. Public
Next.js variables are embedded during `next build`; rebuild after changing the
edition.

Cloud configuration is documented in [.env.example](.env.example). Community
configuration is documented in [community.env.example](community.env.example).
The exact feature, data, API, and billing boundaries are documented in
[Community and Cloud editions](docs/EDITIONS.md).
Cloud operators should also follow the
[billing runbook](docs/CLOUD_BILLING.md).

## Development

```bash
npm ci
npm test
npm run lint
npm run build
```

When running with `npm run dev`, Cloud entitlement checks are bypassed for
local development only. Production builds still require a paid entitlement for
store writes.

The stack is Next.js, React, TypeScript, Tailwind CSS, WebCrypto, Zustand, and
Vitest. Cloud deployments additionally use Clerk, Neon/Drizzle, Lemon Squeezy,
and Vercel Analytics.

## Browser regression checks

Run an isolated development server (keeps your normal dev server and its account
session separate):

```bash
STOREOPS_TEST_BUILD_DIR=.next-qa NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY= CLERK_SECRET_KEY= npm run dev -- --port 3100
```

In another terminal, use an isolated Playwright CLI session:

```bash
npx --package @playwright/cli playwright-cli -s=storeops-qa open http://localhost:3100
npx --package @playwright/cli playwright-cli -s=storeops-qa run-code --filename scripts/browser-fixture.js
npx --package @playwright/cli playwright-cli -s=storeops-qa run-code --filename scripts/browser-pricing-checks.js
npx --package @playwright/cli playwright-cli -s=storeops-qa run-code --filename scripts/browser-failure-checks.js
npx --package @playwright/cli playwright-cli -s=storeops-qa run-code --filename scripts/browser-navigation-checks.js
```

The fixture intercepts all API requests; apply checks change only simulated
prices. Screenshots and the comparison CSV are saved in `output/playwright/`.
Account authentication is excluded from these core-workflow browser fixtures.

## Contributing and security

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Use
`git commit -s` to certify the Developer Certificate of Origin.

Never open a public issue containing credentials or a vulnerability. Follow
[SECURITY.md](SECURITY.md) for private reporting. Community conduct is governed
by [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md), and project decisions follow
[GOVERNANCE.md](GOVERNANCE.md).

## Business model

StoreOps follows an open-source-plus-hosted-convenience model without
withholding the core developer workflows:

- Community users can self-host the full operational tool.
- Cloud customers pay to avoid deployment and maintenance, synchronize recovery
  data across devices, and receive direct support.
- Sponsorships and commercial partnerships may fund additional development.

Buying StoreOps Cloud does not install or switch the Community build. Checkout
events are accepted only by the Cloud edition, verified against the configured
Lemon Squeezy signing secret, and mapped only from StoreOps's configured yearly
and lifetime variant IDs.

## License

StoreOps is licensed under the [GNU Affero General Public License v3.0 only](LICENSE).
If you modify StoreOps and make that modified version available over a network,
the AGPL requires offering the corresponding source to its users. See the
license text for the controlling terms.
