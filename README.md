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
- Builds deterministic worldwide pricing previews from official store data.
- Enforces a maximum movement cap immediately before a pricing write.
- Saves a complete pricing snapshot before applying.
- Re-reads the store after a write and reports success only when values match.
- Edits localized App Store and Google Play listing metadata.
- Prepares localized Google Play “What’s new” notes in Play Console format.
- Imports and exports auditable CSV price sheets.

AI is optional and limited to selecting a pricing strategy and movement cap. It
never generates the final production territory price grid.

## Run Community Edition

### Docker

```bash
git clone https://github.com/alisabry22/storeops.git
cd storeops
docker compose up --build -d
```

Open [http://localhost:3000](http://localhost:3000).

### Node.js

Node.js 22 or newer is required.

```bash
git clone https://github.com/alisabry22/storeops.git
cd storeops
npm ci
cp community.env.example .env.local
npm run dev
```

Community mode needs no Clerk project, database, or Lemon Squeezy account. See
[the self-hosting guide](docs/SELF_HOSTING.md) before exposing it publicly.

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

The stack is Next.js, React, TypeScript, Tailwind CSS, WebCrypto, Zustand, and
Vitest. Cloud deployments additionally use Clerk, Neon/Drizzle, Lemon Squeezy,
and Vercel Analytics.

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
